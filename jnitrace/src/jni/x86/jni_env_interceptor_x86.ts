import { JNIEnvInterceptor } from "../jni_env_interceptor";
import { JNIThreadManager } from "../jni_thread_manager";

import { DataTransport } from "../../transport/data_transport";

import { ReferenceManager } from "../../utils/reference_manager";
import { Types } from "../../utils/types";
import { JavaMethod } from "../../utils/java_method";

class JNIEnvInterceptorX86 extends JNIEnvInterceptor {
    private vaList: NativePointer;
    private vaListOffset: number;

    public constructor(
        references: ReferenceManager,
        threads: JNIThreadManager,
        transport: DataTransport
    ) {
        super(references, threads, transport);

        this.vaList = NULL;
        this.vaListOffset = 0;
    }

    protected buildVaArgParserShellcode(
        text: NativePointer,
        data: NativePointer,
        parser: NativeCallback
    ): void {
        const DATA_OFFSET = 0x400;
        text.add(DATA_OFFSET).writePointer(parser);

        Memory.patchCode(text, Process.pageSize, (code): void => {
            const cw = new X86Writer(code, { pc: text });
            const dataOffset = DATA_OFFSET + Process.pointerSize;

            cw.putPopReg("eax");
            cw.putMovNearPtrReg(
                text.add(dataOffset + Process.pointerSize), "eax"
            );

            cw.putCallAddress(parser);

            cw.putCallReg("eax");

            cw.putJmpNearPtr(text.add(dataOffset + Process.pointerSize));

            cw.flush();
        });
    }

    protected setUpVaListArgExtract(vaList: NativePointer): void {
        this.vaList = vaList;
        this.vaListOffset = 0;
    }

    protected extractVaListArgValue(
        method: JavaMethod,
        paramId: number
    ): NativePointer {
        let currentPtr = this.vaList.add(this.vaListOffset);
        this.vaListOffset += Types.sizeOf(method.fridaParams[paramId]);
        return currentPtr;
    }

    protected resetVaListArgExtract(): void {
        this.vaList = NULL;
        this.vaListOffset = 0;
    }
};

export { JNIEnvInterceptorX86 };
