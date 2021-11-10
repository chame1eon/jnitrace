import { JNILibraryWatcher } from "jnitrace-engine";
import { JNIInterceptor } from "jnitrace-engine";
import { JNINativeReturnValue } from "jnitrace-engine";
import { JNIInvocationCallback } from "jnitrace-engine";
import { Config } from "jnitrace-engine";
import { ConfigBuilder } from "jnitrace-engine";
import { MethodData } from "./utils/method_data";
import { DataTransport } from "./transport/data_transport";

const IS_IN_REPL = false;
const transport = new DataTransport();
let config: Config | null = null;

JNILibraryWatcher.setCallback({
    onLoaded (path: string): void {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!IS_IN_REPL && !Config.initialised()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const op = recv("config", (message: any): void => {
                const builder = new ConfigBuilder();
                /* eslint-disable @typescript-eslint/no-unsafe-assignment */
                /* eslint-disable @typescript-eslint/no-unsafe-member-access */
                builder.libraries = message.payload.libraries;
                builder.backtrace = message.payload.backtrace;
                builder.includeExports = message.payload.include_export;
                builder.excludeExports = message.payload.exclude_export;
                builder.env = message.payload.env;
                builder.vm = message.payload.vm;

                config = builder.build();

                transport.setIncludeFilter(message.payload.include);
                transport.setExcludeFilter(message.payload.exclude);
                /* eslint-enable @typescript-eslint/no-unsafe-member-access */
                /* eslint-enable @typescript-eslint/no-unsafe-assignment */
            });
            op.wait();
        }

        if (config === null) {
            return;
        }

        config.libraries.forEach((element: string): void => {
            if (path.includes(element)) {
                send({
                    type: "tracked_library",
                    library: path
                });
            }
        });
    }
});

const jniEnvCallback: JNIInvocationCallback = {
    onEnter (args: NativeArgumentValue[]): void {
        this.args = args;
    },
    onLeave (retval: JNINativeReturnValue): void {
        const data = new MethodData(
            this.methodDef, this.args, retval.get(), this.javaMethod
        );
        transport.reportJNIEnvCall(
            data, this.backtrace
        );
    }
};

const javaVMCallback: JNIInvocationCallback = {
    onEnter (args: NativeArgumentValue[]): void {
        this.args = args;
    },
    onLeave (retval: JNINativeReturnValue): void {
        const data = new MethodData(
            this.methodDef, this.args, retval.get(), this.javaMethod
        );
        transport.reportJavaVMCall(
            data, this.backtrace
        );
    }
};

JNIInterceptor.attach("DestroyJavaVM", javaVMCallback);
JNIInterceptor.attach("AttachCurrentThread", javaVMCallback);
JNIInterceptor.attach("DetachCurrentThread", javaVMCallback);
JNIInterceptor.attach("GetEnv", javaVMCallback);
JNIInterceptor.attach("AttachCurrentThreadAsDaemon", javaVMCallback);


JNIInterceptor.attach("GetVersion", jniEnvCallback);
JNIInterceptor.attach("DefineClass", jniEnvCallback);
JNIInterceptor.attach("FindClass", jniEnvCallback);
JNIInterceptor.attach("FromReflectedMethod", jniEnvCallback);
JNIInterceptor.attach("FromReflectedField", jniEnvCallback);
JNIInterceptor.attach("ToReflectedMethod", jniEnvCallback);
JNIInterceptor.attach("GetSuperclass", jniEnvCallback);
JNIInterceptor.attach("IsAssignableFrom", jniEnvCallback);
JNIInterceptor.attach("ToReflectedField", jniEnvCallback);
JNIInterceptor.attach("Throw", jniEnvCallback);
JNIInterceptor.attach("ThrowNew", jniEnvCallback);
JNIInterceptor.attach("ExceptionOccurred", jniEnvCallback);
JNIInterceptor.attach("ExceptionDescribe", jniEnvCallback);
JNIInterceptor.attach("ExceptionClear", jniEnvCallback);
JNIInterceptor.attach("FatalError", jniEnvCallback);
JNIInterceptor.attach("PushLocalFrame", jniEnvCallback);
JNIInterceptor.attach("PopLocalFrame", jniEnvCallback);
JNIInterceptor.attach("NewGlobalRef", jniEnvCallback);
JNIInterceptor.attach("DeleteGlobalRef", jniEnvCallback);
JNIInterceptor.attach("DeleteLocalRef", jniEnvCallback);
JNIInterceptor.attach("IsSameObject", jniEnvCallback);
JNIInterceptor.attach("NewLocalRef", jniEnvCallback);
JNIInterceptor.attach("EnsureLocalCapacity", jniEnvCallback);
JNIInterceptor.attach("AllocObject", jniEnvCallback);
JNIInterceptor.attach("NewObject", jniEnvCallback);
JNIInterceptor.attach("NewObjectV", jniEnvCallback);
JNIInterceptor.attach("NewObjectA", jniEnvCallback);
JNIInterceptor.attach("GetObjectClass", jniEnvCallback);
JNIInterceptor.attach("IsInstanceOf", jniEnvCallback);
JNIInterceptor.attach("GetMethodID", jniEnvCallback);
JNIInterceptor.attach("CallObjectMethod", jniEnvCallback);
JNIInterceptor.attach("CallObjectMethodV", jniEnvCallback);
JNIInterceptor.attach("CallObjectMethodA", jniEnvCallback);
JNIInterceptor.attach("CallBooleanMethod", jniEnvCallback);
JNIInterceptor.attach("CallBooleanMethodV", jniEnvCallback);
JNIInterceptor.attach("CallBooleanMethodA", jniEnvCallback);
JNIInterceptor.attach("CallByteMethod", jniEnvCallback);
JNIInterceptor.attach("CallByteMethodV", jniEnvCallback);
JNIInterceptor.attach("CallByteMethodA", jniEnvCallback);
JNIInterceptor.attach("CallCharMethod", jniEnvCallback);
JNIInterceptor.attach("CallCharMethodV", jniEnvCallback);
JNIInterceptor.attach("CallCharMethodA", jniEnvCallback);
JNIInterceptor.attach("CallShortMethod", jniEnvCallback);
JNIInterceptor.attach("CallShortMethodV", jniEnvCallback);
JNIInterceptor.attach("CallShortMethodA", jniEnvCallback);
JNIInterceptor.attach("CallIntMethod", jniEnvCallback);
JNIInterceptor.attach("CallIntMethodV", jniEnvCallback);
JNIInterceptor.attach("CallIntMethodA", jniEnvCallback);
JNIInterceptor.attach("CallLongMethod", jniEnvCallback);
JNIInterceptor.attach("CallLongMethodV", jniEnvCallback);
JNIInterceptor.attach("CallLongMethodA", jniEnvCallback);
JNIInterceptor.attach("CallFloatMethod", jniEnvCallback);
JNIInterceptor.attach("CallFloatMethodV", jniEnvCallback);
JNIInterceptor.attach("CallFloatMethodA", jniEnvCallback);
JNIInterceptor.attach("CallDoubleMethod", jniEnvCallback);
JNIInterceptor.attach("CallDoubleMethodV", jniEnvCallback);
JNIInterceptor.attach("CallDoubleMethodA", jniEnvCallback);
JNIInterceptor.attach("CallVoidMethod", jniEnvCallback);
JNIInterceptor.attach("CallVoidMethodV", jniEnvCallback);
JNIInterceptor.attach("CallVoidMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualObjectMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualObjectMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualObjectMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualBooleanMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualBooleanMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualBooleanMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualByteMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualByteMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualByteMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualCharMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualCharMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualCharMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualShortMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualShortMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualShortMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualIntMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualIntMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualIntMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualLongMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualLongMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualLongMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualFloatMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualFloatMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualFloatMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualDoubleMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualDoubleMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualDoubleMethodA", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualVoidMethod", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualVoidMethodV", jniEnvCallback);
JNIInterceptor.attach("CallNonvirtualVoidMethodA", jniEnvCallback);
JNIInterceptor.attach("GetFieldID", jniEnvCallback);
JNIInterceptor.attach("GetObjectField", jniEnvCallback);
JNIInterceptor.attach("GetBooleanField", jniEnvCallback);
JNIInterceptor.attach("GetByteField", jniEnvCallback);
JNIInterceptor.attach("GetCharField", jniEnvCallback);
JNIInterceptor.attach("GetShortField", jniEnvCallback);
JNIInterceptor.attach("GetIntField", jniEnvCallback);
JNIInterceptor.attach("GetLongField", jniEnvCallback);
JNIInterceptor.attach("GetFloatField", jniEnvCallback);
JNIInterceptor.attach("GetDoubleField", jniEnvCallback);
JNIInterceptor.attach("SetObjectField", jniEnvCallback);
JNIInterceptor.attach("SetBooleanField", jniEnvCallback);
JNIInterceptor.attach("SetByteField", jniEnvCallback);
JNIInterceptor.attach("SetCharField", jniEnvCallback);
JNIInterceptor.attach("SetShortField", jniEnvCallback);
JNIInterceptor.attach("SetIntField", jniEnvCallback);
JNIInterceptor.attach("SetLongField", jniEnvCallback);
JNIInterceptor.attach("SetFloatField", jniEnvCallback);
JNIInterceptor.attach("SetDoubleField", jniEnvCallback);
JNIInterceptor.attach("GetStaticMethodID", jniEnvCallback);
JNIInterceptor.attach("CallStaticObjectMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticObjectMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticObjectMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticBooleanMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticBooleanMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticBooleanMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticByteMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticByteMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticByteMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticCharMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticCharMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticCharMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticShortMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticShortMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticShortMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticIntMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticIntMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticIntMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticLongMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticLongMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticLongMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticFloatMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticFloatMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticFloatMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticDoubleMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticDoubleMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticDoubleMethodA", jniEnvCallback);
JNIInterceptor.attach("CallStaticVoidMethod", jniEnvCallback);
JNIInterceptor.attach("CallStaticVoidMethodV", jniEnvCallback);
JNIInterceptor.attach("CallStaticVoidMethodA", jniEnvCallback);
JNIInterceptor.attach("GetStaticFieldID", jniEnvCallback);
JNIInterceptor.attach("GetStaticObjectField", jniEnvCallback);
JNIInterceptor.attach("GetStaticBooleanField", jniEnvCallback);
JNIInterceptor.attach("GetStaticByteField", jniEnvCallback);
JNIInterceptor.attach("GetStaticCharField", jniEnvCallback);
JNIInterceptor.attach("GetStaticShortField", jniEnvCallback);
JNIInterceptor.attach("GetStaticIntField", jniEnvCallback);
JNIInterceptor.attach("GetStaticLongField", jniEnvCallback);
JNIInterceptor.attach("GetStaticFloatField", jniEnvCallback);
JNIInterceptor.attach("GetStaticDoubleField", jniEnvCallback);
JNIInterceptor.attach("SetStaticObjectField", jniEnvCallback);
JNIInterceptor.attach("SetStaticBooleanField", jniEnvCallback);
JNIInterceptor.attach("SetStaticByteField", jniEnvCallback);
JNIInterceptor.attach("SetStaticCharField", jniEnvCallback);
JNIInterceptor.attach("SetStaticShortField", jniEnvCallback);
JNIInterceptor.attach("SetStaticIntField", jniEnvCallback);
JNIInterceptor.attach("SetStaticLongField", jniEnvCallback);
JNIInterceptor.attach("SetStaticFloatField", jniEnvCallback);
JNIInterceptor.attach("SetStaticDoubleField", jniEnvCallback);
JNIInterceptor.attach("NewString", jniEnvCallback);
JNIInterceptor.attach("GetStringLength", jniEnvCallback);
JNIInterceptor.attach("GetStringChars", jniEnvCallback);
JNIInterceptor.attach("ReleaseStringChars", jniEnvCallback);
JNIInterceptor.attach("NewStringUTF", jniEnvCallback);
JNIInterceptor.attach("GetStringUTFLength", jniEnvCallback);
JNIInterceptor.attach("GetStringUTFChars", jniEnvCallback);
JNIInterceptor.attach("ReleaseStringUTFChars", jniEnvCallback);
JNIInterceptor.attach("GetArrayLength", jniEnvCallback);
JNIInterceptor.attach("NewObjectArray", jniEnvCallback);
JNIInterceptor.attach("GetObjectArrayElement", jniEnvCallback);
JNIInterceptor.attach("SetObjectArrayElement", jniEnvCallback);
JNIInterceptor.attach("NewBooleanArray", jniEnvCallback);
JNIInterceptor.attach("NewByteArray", jniEnvCallback);
JNIInterceptor.attach("NewCharArray", jniEnvCallback);
JNIInterceptor.attach("NewShortArray", jniEnvCallback);
JNIInterceptor.attach("NewIntArray", jniEnvCallback);
JNIInterceptor.attach("NewLongArray", jniEnvCallback);
JNIInterceptor.attach("NewFloatArray", jniEnvCallback);
JNIInterceptor.attach("NewDoubleArray", jniEnvCallback);
JNIInterceptor.attach("GetBooleanArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetByteArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetCharArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetShortArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetIntArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetLongArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetFloatArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetDoubleArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseBooleanArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseByteArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseCharArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseShortArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseIntArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseLongArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseFloatArrayElements", jniEnvCallback);
JNIInterceptor.attach("ReleaseDoubleArrayElements", jniEnvCallback);
JNIInterceptor.attach("GetBooleanArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetByteArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetCharArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetShortArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetIntArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetLongArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetFloatArrayRegion", jniEnvCallback);
JNIInterceptor.attach("GetDoubleArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetBooleanArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetByteArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetCharArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetShortArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetIntArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetLongArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetFloatArrayRegion", jniEnvCallback);
JNIInterceptor.attach("SetDoubleArrayRegion", jniEnvCallback);
JNIInterceptor.attach("RegisterNatives", jniEnvCallback);
JNIInterceptor.attach("UnregisterNatives", jniEnvCallback);
JNIInterceptor.attach("MonitorEnter", jniEnvCallback);
JNIInterceptor.attach("MonitorExit", jniEnvCallback);
JNIInterceptor.attach("GetJavaVM", jniEnvCallback);
JNIInterceptor.attach("GetStringRegion", jniEnvCallback);
JNIInterceptor.attach("GetStringUTFRegion", jniEnvCallback);
JNIInterceptor.attach("GetPrimitiveArrayCritical", jniEnvCallback);
JNIInterceptor.attach("ReleasePrimitiveArrayCritical", jniEnvCallback);
JNIInterceptor.attach("GetStringCritical", jniEnvCallback);
JNIInterceptor.attach("ReleaseStringCritical", jniEnvCallback);
JNIInterceptor.attach("NewWeakGlobalRef", jniEnvCallback);
JNIInterceptor.attach("DeleteWeakGlobalRef", jniEnvCallback);
JNIInterceptor.attach("ExceptionCheck", jniEnvCallback);
JNIInterceptor.attach("NewDirectByteBuffer", jniEnvCallback);
JNIInterceptor.attach("GetDirectBufferAddress", jniEnvCallback);
JNIInterceptor.attach("GetDirectBufferCapacity", jniEnvCallback);
JNIInterceptor.attach("GetObjectRefType", jniEnvCallback);
