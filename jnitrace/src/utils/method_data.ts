import { JNIMethod } from "../jni/jni_method.js";

import { JavaMethod } from "./java_method.js";

class MethodData {
    private readonly _method: JNIMethod;
    private readonly _jmethod: JavaMethod | undefined;
    private readonly _args: NativeArgumentValue[];
    private readonly _jparams: string[];
    private readonly _ret: NativeReturnValue;

    public constructor(
        method: JNIMethod,
        args: NativeArgumentValue[],
        ret: NativeReturnValue,
        jmethod?: JavaMethod,
        jparams? : string[]
    ) {
        this._method = method;
        this._jmethod = jmethod;
        this._args = args;
        this._ret = ret;
        if (jparams === undefined) {
            this._jparams = [];
        } else {
            this._jparams = jparams;
        }
    };

    public get method(): JNIMethod {
        return this._method;
    }

    public get javaMethod(): JavaMethod | undefined {
        return this._jmethod;
    }

    public get args(): NativeArgumentValue[] {
        return this._args;
    };

    public getArgAsPtr(i: number): NativePointer {
        return this._args[i] as NativePointer;
    }

    public getArgAsNum(i: number): number {
        return this._args[i] as number;
    }

    public get jParams(): string[] {
        return this._jparams;
    };

    public get ret(): NativeReturnValue {
        return this._ret;
    };
};

export { MethodData };