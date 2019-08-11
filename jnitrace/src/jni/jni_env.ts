import JNI_ENV_METHODS from "../data/jni_env.json";
import { JNIMethod } from "./jni_method";

class JNIEnv {
    private static instance: JNIEnv;

    private readonly _methods: JNIMethod[];

    public constructor() {
        this._methods = JNI_ENV_METHODS;
    }

    public get methods(): JNIMethod[] {
        return this._methods;
    }

    public static getInstance(): JNIEnv {
        if (JNIEnv.instance !== undefined) {
            JNIEnv.instance = new JNIEnv();
        }
        return JNIEnv.instance;
    }
};

export { JNIEnv };