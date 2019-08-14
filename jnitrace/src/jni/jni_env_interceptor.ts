import { JNIThreadManager } from "./jni_thread_manager";
import { JavaVMInterceptor } from "./java_vm_interceptor";
import { JNIMethod } from "./jni_method";

import { DataTransport } from "../transport/data_transport";

import { ReferenceManager } from "../utils/reference_manager";
import { Types } from "../utils/types";
import { JavaMethod } from "../utils/java_method";
import { MethodData } from "../utils/method_data";
import { Config } from "../utils/config";

import JNI_ENV_METHODS from "../data/jni_env.json";

const TYPE_NAME_START = 0;
const TYPE_NAME_END = -1;
const COPY_ARRAY_INDEX = 0;
const JNI_ENV_INDEX = 0;

abstract class JNIEnvInterceptor {
    protected references: ReferenceManager;
    protected threads: JNIThreadManager;
    protected transport: DataTransport;
    protected javaVMInterceptor: JavaVMInterceptor | null;

    protected shadowJNIEnv: NativePointer = NULL;
    protected methods: { [ id: string ]: JavaMethod } = {};
    protected fastMethodLookup: { [ id: string ]: NativeCallback } = {};
    protected vaArgsBacktraces: { [ id: number ]: NativePointer[] } = {};

    public constructor(
        references: ReferenceManager,
        threads: JNIThreadManager,
        transport: DataTransport
    ) {
        this.references = references;
        this.threads = threads;
        this.transport = transport;

        this.javaVMInterceptor = null;
        this.vaArgsBacktraces = {};
    }

    public isInitialised(): boolean {
        return !this.shadowJNIEnv.equals(NULL);
    }

    public get(): NativePointer {
        return this.shadowJNIEnv;
    }

    public create(): NativePointer {
        const END_INDEX = 1;
        const threadId = Process.getCurrentThreadId();
        const jniEnv = this.threads.getJNIEnv(threadId);
        const jniEnvOffset = 4;
        const jniEnvLength = 232;

        const newJNIEnvStruct = Memory.alloc(Process.pointerSize * jniEnvLength);
        this.references.add(newJNIEnvStruct);

        const newJNIEnv = Memory.alloc(Process.pointerSize);
        newJNIEnv.writePointer(newJNIEnvStruct);
        this.references.add(newJNIEnv);

        for (let i = jniEnvOffset; i < jniEnvLength; i++) {
            const method = JNI_ENV_METHODS[i];
            const offset = i * Process.pointerSize;
            const jniEnvStruct = jniEnv.readPointer();
            const methodAddr = jniEnvStruct.add(offset).readPointer();

            if (method.args[method.args.length - END_INDEX] === "...") {
                const callback = this.createJNIVarArgIntercept(i, methodAddr);
                const trampoline = this.createStubFunction();
                this.references.add(trampoline);
                // ensure the CpuContext will be populated
                Interceptor.replace(trampoline, callback);
                newJNIEnvStruct.add(offset).writePointer(trampoline);
            } else {
                const callback = this.createJNIIntercept(i, methodAddr);
                const trampoline = this.createStubFunction();
                this.references.add(trampoline);
                // ensure the CpuContext will be populated
                Interceptor.replace(trampoline, callback);
                newJNIEnvStruct.add(offset).writePointer(trampoline);
            }
        }

        this.shadowJNIEnv = newJNIEnv;

        return newJNIEnv;
    }

    public setJavaVMInterceptor(javaVMInterceptor: JavaVMInterceptor): void {
        this.javaVMInterceptor = javaVMInterceptor;
    }

    public createStubFunction(): NativeCallback {
        return new NativeCallback((): void => {}, 'void', []);
    }

    protected createJNIVarArgIntercept(
        id: number,
        methodPtr: NativePointer
    ): NativePointer {
        const self = this;
        const method = JNI_ENV_METHODS[id];

        const text = Memory.alloc(Process.pageSize);
        const data = Memory.alloc(Process.pageSize);

        this.references.add(text);
        this.references.add(data);

        const vaArgsCallback = this.createJNIVarArgInitialCallback(
            method, methodPtr
        );
    
        this.references.add(vaArgsCallback);

        self.buildVaArgParserShellcode(text, data, vaArgsCallback);

        const config = Config.getInstance();

        Interceptor.attach(text, function(this: InvocationContext): void {
            let backtraceType = Backtracer.ACCURATE;
            if (config.backtrace === "fuzzy") {
                backtraceType = config.backtrace;
            }

            self.vaArgsBacktraces[this.threadId] =
                        Thread.backtrace(this.context, backtraceType);
        });

        return text;
    }

    private addJavaArgsForJNIIntercept(
        method: JNIMethod,
        args: NativeArgumentValue[]
    ): NativeArgumentValue[] {
        const LAST_INDEX = -1;
        const FIRST_INDEX = 0;
        const METHOD_ID_INDEX = 2;
        const lastParamType = method.args.slice(LAST_INDEX)[FIRST_INDEX];

        if (!["va_list", "jvalue*"].includes(lastParamType)) {
            return args.slice(COPY_ARRAY_INDEX);
        }

        const clonedArgs = args.slice(COPY_ARRAY_INDEX);
        const midPtr = args[METHOD_ID_INDEX] as NativePointer;
        const javaMethod = this.methods[midPtr.toString()];
        const nativeJTypes = javaMethod.nativeParams;
        const readPtr = args.slice(LAST_INDEX)[FIRST_INDEX] as NativePointer;

        if (lastParamType === "va_list") {
            this.setUpVaListArgExtract(readPtr);
        }

        const UNION_SIZE = 8;
        for (let i = 0; i < nativeJTypes.length; i++) {
            const type = Types.convertNativeJTypeToFridaType(nativeJTypes[i]);
            let val;
            if (lastParamType === "va_list") {
                const currentPtr = this.extractVaListArgValue(javaMethod, i);
                val = this.readValue(currentPtr, type, true);
            } else {
                val = this.readValue(readPtr.add(UNION_SIZE * i), type);
            }

            clonedArgs.push(val);
        }

        if (lastParamType === "va_list") {
            this.resetVaListArgExtract();
        }

        return clonedArgs;
    }

    private handleGetMethodResult(
        args: NativeArgumentValue[],
        ret: NativeReturnValue
    ): void {
        const SIG_INDEX = 3;
        const signature = (args[SIG_INDEX] as NativePointer).readCString();

        if (signature !== null) {
            const methodSig = new JavaMethod(signature);

            this.methods[(ret as NativePointer).toString()] = methodSig;
        }
    }

    private handleGetJavaVM(
        args: NativeArgumentValue[],
        ret: NativeReturnValue
    ): void {
        if (this.javaVMInterceptor !== null) {
            const JNI_OK = 0;
            const JAVA_VM_INDEX = 1;

            if (ret === JNI_OK) {
                const javaVMPtr = args[JAVA_VM_INDEX] as NativePointer;
                this.threads.setJavaVM(javaVMPtr.readPointer());

                let javaVM;
                if (!this.javaVMInterceptor.isInitialised()) {
                    javaVM = this.javaVMInterceptor.create();
                } else {
                    javaVM = this.javaVMInterceptor.get();
                }
    
                javaVMPtr.writePointer(javaVM);
            }
        }
    }

    private handleRegisterNatives(args: NativeArgumentValue[]): void {
        const METHOD_INDEX = 2;
        const SIZE_INDEX = 3;
        const JNI_METHOD_SIZE = 3;

        const self = this;

        const methods = args[METHOD_INDEX] as NativePointer;
        const size = args[SIZE_INDEX] as number;
        for (let i = 0; i < size * JNI_METHOD_SIZE; i += JNI_METHOD_SIZE) {
            const methodsPtr = methods;

            const namePtr = methodsPtr
                .add(i * Process.pointerSize)
                .readPointer();
            const name = namePtr.readCString();

            const sigOffset = 1;
            const sigPtr = methodsPtr
                .add((i + sigOffset) * Process.pointerSize)
                .readPointer();
            const sig = sigPtr.readCString();

            const addrOffset = 2;
            const addr = methodsPtr
                .add((i + addrOffset) * Process.pointerSize)
                .readPointer();

            if (name === null || sig === null) {
                continue;
            }

            Interceptor.attach(addr, {
                onEnter(args): void {
                    const check = name + sig;
                    const config = Config.getInstance();
                    const EMPTY_ARRAY_LEN = 0;

                    if (config.includeExport.length > EMPTY_ARRAY_LEN) {
                        const included = config.includeExport.filter(
                            (i): boolean => check.includes(i)
                        );
                        if (included.length === EMPTY_ARRAY_LEN) {
                            return;
                        }
                    }
                    if (config.excludeExport.length > EMPTY_ARRAY_LEN) {
                        const excluded = config.excludeExport.filter(
                            (e): boolean => check.includes(e)
                        );
                        if (excluded.length > EMPTY_ARRAY_LEN) {
                            return;
                        }
                    }

                    if (!self.threads.hasJNIEnv(this.threadId)) {
                        self.threads.setJNIEnv(
                            this.threadId, args[JNI_ENV_INDEX]
                        );
                    }
                    args[JNI_ENV_INDEX] = self.shadowJNIEnv;
                }
            });
        }
    }

    private handleJNIInterceptResult(
        method: JNIMethod,
        args: NativeArgumentValue[],
        ret: NativeReturnValue
    ): void {
        const name = method.name;

        if (["GetMethodID", "GetStaticMethodID"].includes(name)) {
            this.handleGetMethodResult(args, ret);   
        } else if (method.name === "GetJavaVM") {
            this.handleGetJavaVM(args, ret);
        } else if (method.name === "RegisterNatives") {
            this.handleRegisterNatives(args);
        }
    }

    private createJNIIntercept(
        id: number,
        methodPtr: NativePointer
    ): NativeCallback {
        const self = this;
        const METHOD_ID_INDEX = 2;
        const method = JNI_ENV_METHODS[id];

        const paramTypes = method.args.map(
            (t: string): string => Types.convertNativeJTypeToFridaType(t)
        );
        const retType = Types.convertNativeJTypeToFridaType(method.ret);

        const nativeFunction = new NativeFunction(methodPtr, retType, paramTypes);
        const nativeCallback = new NativeCallback(function(
            this: InvocationContext
        ): NativeReturnValue {
            const threadId = this.threadId;
            const jniEnv = self.threads.getJNIEnv(threadId);
            const args: NativeArgumentValue[] = [].slice.call(arguments);

            args[JNI_ENV_INDEX] = jniEnv;

            const clonedArgs = self.addJavaArgsForJNIIntercept(method, args);

            const ret = nativeFunction.apply(null, args);

            let jmethod: JavaMethod | undefined = undefined;
            if (args.length !== clonedArgs.length) {
                const key = args[METHOD_ID_INDEX].toString();
                jmethod = self.methods[key];
            }
            const data = new MethodData(
                method, clonedArgs, ret, jmethod
            );

            self.transport.reportJNIEnvCall(data, this.context);

            self.handleJNIInterceptResult(method, args, ret);

            return ret;
        }, retType, paramTypes);

        this.references.add(nativeCallback);

        return nativeCallback;
    }

    private createJNIVarArgMainCallback(
        method: JNIMethod,
        methodPtr: NativePointer,
        initialparamTypes: string[],
        mainParamTypes: string[],
        retType: string
    ): NativeCallback {
        const self = this;

        const mainCallback = new NativeCallback(function(
            this: InvocationContext
        ): NativeReturnValue {
            const METHOD_ID_INDEX = 2;
            const threadId = this.threadId;
            const args: NativeArgumentValue[] = [].slice.call(arguments);
            const jniEnv = self.threads.getJNIEnv(threadId);
            const key = args[METHOD_ID_INDEX].toString();
            const jmethod = self.methods[key];

            args[JNI_ENV_INDEX] = jniEnv;

            const ret = new NativeFunction(methodPtr,
                retType,
                initialparamTypes).apply(null, args);

            const data = new MethodData(method, args, ret, jmethod);

            self.transport.reportJNIEnvCall(
                data, self.vaArgsBacktraces[this.threadId]
            );

            delete self.vaArgsBacktraces[this.threadId];

            return ret;
        }, retType, mainParamTypes);

        return mainCallback;
    }

    private createJNIVarArgInitialCallback(
        method: JNIMethod,
        methodPtr: NativePointer
    ): NativeCallback {
        const self = this;

        const vaArgsCallback = new NativeCallback(function(): NativeReturnValue {
            const METHOD_ID_INDEX = 2;
            const methodId = arguments[METHOD_ID_INDEX];
            const javaMethod = self.methods[methodId];

            if (self.fastMethodLookup[methodId] !== undefined) {
                return self.fastMethodLookup[methodId];
            }

            const originalParams = method.args
                .slice(TYPE_NAME_START, TYPE_NAME_END)
                .map((t): string => Types.convertNativeJTypeToFridaType(t));
            const callbackParams = originalParams.slice(COPY_ARRAY_INDEX);

            originalParams.push("...");

            javaMethod.fridaParams.forEach((p): void => {
                callbackParams.push(p === "float" ? "double" : p);
                originalParams.push(p);
            });

            const retType = Types.convertNativeJTypeToFridaType(method.ret);

            const mainCallback =  self.createJNIVarArgMainCallback(
                method, methodPtr, originalParams, callbackParams, retType
            );
            self.references.add(mainCallback);

            self.fastMethodLookup[methodId] = mainCallback;

            return mainCallback;
        }, "pointer", ["pointer", "pointer", "pointer"]);

        return vaArgsCallback;
    }

    private readValue(
        currentPtr: NativePointer,
        type: string,
        extend? : boolean
    ): NativeArgumentValue {
        let val: NativeArgumentValue = NULL;

        if (type === "char") {
            val = currentPtr.readS8();
        } else if (type === "int16") {
            val = currentPtr.readS16();
        } else if (type === "uint16") {
            val = currentPtr.readU16();
        } else if (type === "int") {
            val = currentPtr.readS32();
        } else if (type === "int64") {
            val = currentPtr.readS64();
        } else if (type === "float") {
            if (extend === true) {
                val = currentPtr.readDouble();
            } else {
                val = currentPtr.readFloat();
            }
        } else if (type === "double") {
            val = currentPtr.readDouble();
        } else if (type === "pointer") {
            val = currentPtr.readPointer();
        }

        return val;
    }

    protected abstract buildVaArgParserShellcode(
        text: NativePointer,
        data: NativePointer,
        parser: NativeCallback
    ): void;

    protected abstract setUpVaListArgExtract(vaList: NativePointer): void;

    protected abstract extractVaListArgValue(
        method: JavaMethod,
        index: number
    ): NativePointer;

    protected abstract resetVaListArgExtract(): void;
};

export { JNIEnvInterceptor };
