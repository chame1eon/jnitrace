import JAVA_VM_METHODS from "../data/java_vm.json";
import { JNIMethod } from "./jni_method";

class JavaVM {
    private static instance: JavaVM;

    private readonly _methods: JNIMethod[];

    public constructor() {
        this._methods = JAVA_VM_METHODS;
    }

    public get methods(): JNIMethod[] {
        return this._methods;
    }

    public static getInstance(): JavaVM {
        if (JavaVM.instance === undefined) {
            JavaVM.instance = new JavaVM();
        }
        return JavaVM.instance;
    }
}

export { JavaVM };