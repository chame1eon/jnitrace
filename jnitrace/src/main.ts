import { JNILibraryWatcher } from "jnitrace-engine";
import { JNIInterceptor } from "jnitrace-engine";
import { JNINativeReturnValue } from "jnitrace-engine";
import { JNIInvocationCallback } from "jnitrace-engine";
import { Config } from "jnitrace-engine";
import { ConfigBuilder } from "jnitrace-engine";
import { MethodData } from "./utils/method_data";
import { DataTransport } from "./transport/data_transport";

const IS_IN_REPL = true;
const transport = new DataTransport();
let config : Config | null = null;

JNILibraryWatcher.setCallback({
    onLoaded(path : string) {
        if (!IS_IN_REPL && !Config.initialised()) {
            const op = recv("config", (message): void => {
                const builder = new ConfigBuilder();
                builder.libraries = message.payload.libraries;
                builder.backtrace = message.payload.backtrace;
                builder.includeExports = message.payload.include_export;
                builder.excludeExports = message.payload.exclude_export;
                builder.env = message.payload.env;
                builder.vm = message.payload.vm;

                config = builder.build();

                transport.setIncludeFilter(message.payload.include);
                transport.setExcludeFilter(message.payload.exclude);
            });
            op.wait();
        }

        if (config === null) {
            return;
        }

        config.libraries.forEach((element : string) => {
            if (path.includes(element)) {
                send({
                    type: "tracked_library",
                    library: path
                });
            }
        });
    }
});

const callback : JNIInvocationCallback = {
    onEnter(args : NativeArgumentValue[]) {
        this.args = args;
    },
    onLeave(retval : JNINativeReturnValue) {
        const data = new MethodData(this.methodDef, this.args, retval.get(), this.javaMethod);
        transport.reportJNIEnvCall(
            data, this.backtrace
        );
    }
}

JNIInterceptor.attach("DestroyJavaVM", callback);
JNIInterceptor.attach("AttachCurrentThread", callback);
JNIInterceptor.attach("DetachCurrentThread", callback);
JNIInterceptor.attach("GetEnv", callback);
JNIInterceptor.attach("AttachCurrentThreadAsDaemon", callback);


JNIInterceptor.attach("GetVersion", callback);
JNIInterceptor.attach("DefineClass", callback);
JNIInterceptor.attach("FindClass", callback);
JNIInterceptor.attach("FromReflectedMethod", callback);
JNIInterceptor.attach("FromReflectedField", callback);
JNIInterceptor.attach("ToReflectedMethod", callback);
JNIInterceptor.attach("GetSuperclass", callback);
JNIInterceptor.attach("IsAssignableFrom", callback);
JNIInterceptor.attach("ToReflectedField", callback);
JNIInterceptor.attach("Throw", callback);
JNIInterceptor.attach("ThrowNew", callback);
JNIInterceptor.attach("ExceptionOccurred", callback);
JNIInterceptor.attach("ExceptionDescribe", callback);
JNIInterceptor.attach("ExceptionClear", callback);
JNIInterceptor.attach("FatalError", callback);
JNIInterceptor.attach("PushLocalFrame", callback);
JNIInterceptor.attach("PopLocalFrame", callback);
JNIInterceptor.attach("NewGlobalRef", callback);
JNIInterceptor.attach("DeleteGlobalRef", callback);
JNIInterceptor.attach("DeleteLocalRef", callback);
JNIInterceptor.attach("IsSameObject", callback);
JNIInterceptor.attach("NewLocalRef", callback);
JNIInterceptor.attach("EnsureLocalCapacity", callback);
JNIInterceptor.attach("AllocObject", callback);
JNIInterceptor.attach("NewObject", callback);
JNIInterceptor.attach("NewObjectV", callback);
JNIInterceptor.attach("NewObjectA", callback);
JNIInterceptor.attach("GetObjectClass", callback);
JNIInterceptor.attach("IsInstanceOf", callback);
JNIInterceptor.attach("GetMethodID", callback);
JNIInterceptor.attach("CallObjectMethod", callback);
JNIInterceptor.attach("CallObjectMethodV", callback);
JNIInterceptor.attach("CallObjectMethodA", callback);
JNIInterceptor.attach("CallBooleanMethod", callback);
JNIInterceptor.attach("CallBooleanMethodV", callback);
JNIInterceptor.attach("CallBooleanMethodA", callback);
JNIInterceptor.attach("CallByteMethod", callback);
JNIInterceptor.attach("CallByteMethodV", callback);
JNIInterceptor.attach("CallByteMethodA", callback);
JNIInterceptor.attach("CallCharMethod", callback);
JNIInterceptor.attach("CallCharMethodV", callback);
JNIInterceptor.attach("CallCharMethodA", callback);
JNIInterceptor.attach("CallShortMethod", callback);
JNIInterceptor.attach("CallShortMethodV", callback);
JNIInterceptor.attach("CallShortMethodA", callback);
JNIInterceptor.attach("CallIntMethod", callback);
JNIInterceptor.attach("CallIntMethodV", callback);
JNIInterceptor.attach("CallIntMethodA", callback);
JNIInterceptor.attach("CallLongMethod", callback);
JNIInterceptor.attach("CallLongMethodV", callback);
JNIInterceptor.attach("CallLongMethodA", callback);
JNIInterceptor.attach("CallFloatMethod", callback);
JNIInterceptor.attach("CallFloatMethodV", callback);
JNIInterceptor.attach("CallFloatMethodA", callback);
JNIInterceptor.attach("CallDoubleMethod", callback);
JNIInterceptor.attach("CallDoubleMethodV", callback);
JNIInterceptor.attach("CallDoubleMethodA", callback);
JNIInterceptor.attach("CallVoidMethod", callback);
JNIInterceptor.attach("CallVoidMethodV", callback);
JNIInterceptor.attach("CallVoidMethodA", callback);
JNIInterceptor.attach("CallNonvirtualObjectMethod", callback);
JNIInterceptor.attach("CallNonvirtualObjectMethodV", callback);
JNIInterceptor.attach("CallNonvirtualObjectMethodA", callback);
JNIInterceptor.attach("CallNonvirtualBooleanMethod", callback);
JNIInterceptor.attach("CallNonvirtualBooleanMethodV", callback);
JNIInterceptor.attach("CallNonvirtualBooleanMethodA", callback);
JNIInterceptor.attach("CallNonvirtualByteMethod", callback);
JNIInterceptor.attach("CallNonvirtualByteMethodV", callback);
JNIInterceptor.attach("CallNonvirtualByteMethodA", callback);
JNIInterceptor.attach("CallNonvirtualCharMethod", callback);
JNIInterceptor.attach("CallNonvirtualCharMethodV", callback);
JNIInterceptor.attach("CallNonvirtualCharMethodA", callback);
JNIInterceptor.attach("CallNonvirtualShortMethod", callback);
JNIInterceptor.attach("CallNonvirtualShortMethodV", callback);
JNIInterceptor.attach("CallNonvirtualShortMethodA", callback);
JNIInterceptor.attach("CallNonvirtualIntMethod", callback);
JNIInterceptor.attach("CallNonvirtualIntMethodV", callback);
JNIInterceptor.attach("CallNonvirtualIntMethodA", callback);
JNIInterceptor.attach("CallNonvirtualLongMethod", callback);
JNIInterceptor.attach("CallNonvirtualLongMethodV", callback);
JNIInterceptor.attach("CallNonvirtualLongMethodA", callback);
JNIInterceptor.attach("CallNonvirtualFloatMethod", callback);
JNIInterceptor.attach("CallNonvirtualFloatMethodV", callback);
JNIInterceptor.attach("CallNonvirtualFloatMethodA", callback);
JNIInterceptor.attach("CallNonvirtualDoubleMethod", callback);
JNIInterceptor.attach("CallNonvirtualDoubleMethodV", callback);
JNIInterceptor.attach("CallNonvirtualDoubleMethodA", callback);
JNIInterceptor.attach("CallNonvirtualVoidMethod", callback);
JNIInterceptor.attach("CallNonvirtualVoidMethodV", callback);
JNIInterceptor.attach("CallNonvirtualVoidMethodA", callback);
JNIInterceptor.attach("GetFieldID", callback);
JNIInterceptor.attach("GetObjectField", callback);
JNIInterceptor.attach("GetBooleanField", callback);
JNIInterceptor.attach("GetByteField", callback);
JNIInterceptor.attach("GetCharField", callback);
JNIInterceptor.attach("GetShortField", callback);
JNIInterceptor.attach("GetIntField", callback);
JNIInterceptor.attach("GetLongField", callback);
JNIInterceptor.attach("GetFloatField", callback);
JNIInterceptor.attach("GetDoubleField", callback);
JNIInterceptor.attach("SetObjectField", callback);
JNIInterceptor.attach("SetBooleanField", callback);
JNIInterceptor.attach("SetByteField", callback);
JNIInterceptor.attach("SetCharField", callback);
JNIInterceptor.attach("SetShortField", callback);
JNIInterceptor.attach("SetIntField", callback);
JNIInterceptor.attach("SetLongField", callback);
JNIInterceptor.attach("SetFloatField", callback);
JNIInterceptor.attach("SetDoubleField", callback);
JNIInterceptor.attach("GetStaticMethodID", callback);
JNIInterceptor.attach("CallStaticObjectMethod", callback);
JNIInterceptor.attach("CallStaticObjectMethodV", callback);
JNIInterceptor.attach("CallStaticObjectMethodA", callback);
JNIInterceptor.attach("CallStaticBooleanMethod", callback);
JNIInterceptor.attach("CallStaticBooleanMethodV", callback);
JNIInterceptor.attach("CallStaticBooleanMethodA", callback);
JNIInterceptor.attach("CallStaticByteMethod", callback);
JNIInterceptor.attach("CallStaticByteMethodV", callback);
JNIInterceptor.attach("CallStaticByteMethodA", callback);
JNIInterceptor.attach("CallStaticCharMethod", callback);
JNIInterceptor.attach("CallStaticCharMethodV", callback);
JNIInterceptor.attach("CallStaticCharMethodA", callback);
JNIInterceptor.attach("CallStaticShortMethod", callback);
JNIInterceptor.attach("CallStaticShortMethodV", callback);
JNIInterceptor.attach("CallStaticShortMethodA", callback);
JNIInterceptor.attach("CallStaticIntMethod", callback);
JNIInterceptor.attach("CallStaticIntMethodV", callback);
JNIInterceptor.attach("CallStaticIntMethodA", callback);
JNIInterceptor.attach("CallStaticLongMethod", callback);
JNIInterceptor.attach("CallStaticLongMethodV", callback);
JNIInterceptor.attach("CallStaticLongMethodA", callback);
JNIInterceptor.attach("CallStaticFloatMethod", callback);
JNIInterceptor.attach("CallStaticFloatMethodV", callback);
JNIInterceptor.attach("CallStaticFloatMethodA", callback);
JNIInterceptor.attach("CallStaticDoubleMethod", callback);
JNIInterceptor.attach("CallStaticDoubleMethodV", callback);
JNIInterceptor.attach("CallStaticDoubleMethodA", callback);
JNIInterceptor.attach("CallStaticVoidMethod", callback);
JNIInterceptor.attach("CallStaticVoidMethodV", callback);
JNIInterceptor.attach("CallStaticVoidMethodA", callback);
JNIInterceptor.attach("GetStaticFieldID", callback);
JNIInterceptor.attach("GetStaticObjectField", callback);
JNIInterceptor.attach("GetStaticBooleanField", callback);
JNIInterceptor.attach("GetStaticByteField", callback);
JNIInterceptor.attach("GetStaticCharField", callback);
JNIInterceptor.attach("GetStaticShortField", callback);
JNIInterceptor.attach("GetStaticIntField", callback);
JNIInterceptor.attach("GetStaticLongField", callback);
JNIInterceptor.attach("GetStaticFloatField", callback);
JNIInterceptor.attach("GetStaticDoubleField", callback);
JNIInterceptor.attach("SetStaticObjectField", callback);
JNIInterceptor.attach("SetStaticBooleanField", callback);
JNIInterceptor.attach("SetStaticByteField", callback);
JNIInterceptor.attach("SetStaticCharField", callback);
JNIInterceptor.attach("SetStaticShortField", callback);
JNIInterceptor.attach("SetStaticIntField", callback);
JNIInterceptor.attach("SetStaticLongField", callback);
JNIInterceptor.attach("SetStaticFloatField", callback);
JNIInterceptor.attach("SetStaticDoubleField", callback);
JNIInterceptor.attach("NewString", callback);
JNIInterceptor.attach("GetStringLength", callback);
JNIInterceptor.attach("GetStringChars", callback);
JNIInterceptor.attach("ReleaseStringChars", callback);
JNIInterceptor.attach("NewStringUTF", callback);
JNIInterceptor.attach("GetStringUTFLength", callback);
JNIInterceptor.attach("GetStringUTFChars", callback);
JNIInterceptor.attach("ReleaseStringUTFChars", callback);
JNIInterceptor.attach("GetArrayLength", callback);
JNIInterceptor.attach("NewObjectArray", callback);
JNIInterceptor.attach("GetObjectArrayElement", callback);
JNIInterceptor.attach("SetObjectArrayElement", callback);
JNIInterceptor.attach("NewBooleanArray", callback);
JNIInterceptor.attach("NewByteArray", callback);
JNIInterceptor.attach("NewCharArray", callback);
JNIInterceptor.attach("NewShortArray", callback);
JNIInterceptor.attach("NewIntArray", callback);
JNIInterceptor.attach("NewLongArray", callback);
JNIInterceptor.attach("NewFloatArray", callback);
JNIInterceptor.attach("NewDoubleArray", callback);
JNIInterceptor.attach("GetBooleanArrayElements", callback);
JNIInterceptor.attach("GetByteArrayElements", callback);
JNIInterceptor.attach("GetCharArrayElements", callback);
JNIInterceptor.attach("GetShortArrayElements", callback);
JNIInterceptor.attach("GetIntArrayElements", callback);
JNIInterceptor.attach("GetLongArrayElements", callback);
JNIInterceptor.attach("GetFloatArrayElements", callback);
JNIInterceptor.attach("GetDoubleArrayElements", callback);
JNIInterceptor.attach("ReleaseBooleanArrayElements", callback);
JNIInterceptor.attach("ReleaseByteArrayElements", callback);
JNIInterceptor.attach("ReleaseCharArrayElements", callback);
JNIInterceptor.attach("ReleaseShortArrayElements", callback);
JNIInterceptor.attach("ReleaseIntArrayElements", callback);
JNIInterceptor.attach("ReleaseLongArrayElements", callback);
JNIInterceptor.attach("ReleaseFloatArrayElements", callback);
JNIInterceptor.attach("ReleaseDoubleArrayElements", callback);
JNIInterceptor.attach("GetBooleanArrayRegion", callback);
JNIInterceptor.attach("GetByteArrayRegion", callback);
JNIInterceptor.attach("GetCharArrayRegion", callback);
JNIInterceptor.attach("GetShortArrayRegion", callback);
JNIInterceptor.attach("GetIntArrayRegion", callback);
JNIInterceptor.attach("GetLongArrayRegion", callback);
JNIInterceptor.attach("GetFloatArrayRegion", callback);
JNIInterceptor.attach("GetDoubleArrayRegion", callback);
JNIInterceptor.attach("SetBooleanArrayRegion", callback);
JNIInterceptor.attach("SetByteArrayRegion", callback);
JNIInterceptor.attach("SetCharArrayRegion", callback);
JNIInterceptor.attach("SetShortArrayRegion", callback);
JNIInterceptor.attach("SetIntArrayRegion", callback);
JNIInterceptor.attach("SetLongArrayRegion", callback);
JNIInterceptor.attach("SetFloatArrayRegion", callback);
JNIInterceptor.attach("SetDoubleArrayRegion", callback);
JNIInterceptor.attach("RegisterNatives", callback);
JNIInterceptor.attach("UnregisterNatives", callback);
JNIInterceptor.attach("MonitorEnter", callback);
JNIInterceptor.attach("MonitorExit", callback);
JNIInterceptor.attach("GetJavaVM", callback);
JNIInterceptor.attach("GetStringRegion", callback);
JNIInterceptor.attach("GetStringUTFRegion", callback);
JNIInterceptor.attach("GetPrimitiveArrayCritical", callback);
JNIInterceptor.attach("ReleasePrimitiveArrayCritical", callback);
JNIInterceptor.attach("GetStringCritical", callback);
JNIInterceptor.attach("ReleaseStringCritical", callback);
JNIInterceptor.attach("NewWeakGlobalRef", callback);
JNIInterceptor.attach("DeleteWeakGlobalRef", callback);
JNIInterceptor.attach("ExceptionCheck", callback);
JNIInterceptor.attach("NewDirectByteBuffer", callback);
JNIInterceptor.attach("GetDirectBufferAddress", callback);
JNIInterceptor.attach("GetDirectBufferCapacity", callback);
JNIInterceptor.attach("GetObjectRefType", callback);


