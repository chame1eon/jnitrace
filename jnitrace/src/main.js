var Types = require("./utils/types");
var JavaMethod = require("./utils/java_method");
var JNIThreadManager = require("./jni/jni_thread_manager");
var ReferenceManager = require("./utils/reference_manager");
var TraceTransport = require("./transport/trace_transport");

var JNIEnvInterceptorX86 = require("./jni/x86/jni_env_interceptor_x86");
var JNIEnvInterceptorX64 = require("./jni/x64/jni_env_interceptor_x64");
var JNIEnvInterceptorARM = require("./jni/arm/jni_env_interceptor_arm");

var JavaVMInterceptor = require("./jni/java_vm_interceptor");


var threads = new JNIThreadManager();
var references = new ReferenceManager();
var transport = new TraceTransport(threads);

var jniEnvInterceptor = null;
if (Process.arch === "ia32") {
  jniEnvInterceptor = new JNIEnvInterceptorX86(references, threads, transport);
} else if (Process.arch === "x64") {
  jniEnvInterceptor = new JNIEnvInterceptorX64(references, threads, transport);
} else if (Process.arch === "arm") {
  jniEnvInterceptor = new JNIEnvInterceptorARM(references, threads, transport);
}

if (!jniEnvInterceptor) {
  throw new Error(
    Process.arch + " currently unsupported, please file an issue."
  );
}

var javaVMInterceptor = new JavaVMInterceptor(
                              references,
                              threads,
                              jniEnvInterceptor
                            );

var libsToTrack = ['*'];
var trackedLibs = {};


// need to run this before start up.
function checkLibrary(path) {
  if (libsToTrack.length === 0) {
    var op = recv('libraries', function(message) {
      libsToTrack = message.payload;
    });
    op.wait();
  }
  if (libsToTrack.length === 1) {
    if (libsToTrack[0] === "*") {
      return true;
    }
  }
  for (var i = 0; i < libsToTrack.length; i++) {
    if (path.indexOf(libsToTrack[i]) > -1) {
      return true;
    }
  }
  return false;
}

function interceptJNIOnLoad(jniOnLoadAddr) {
  return Interceptor.attach(jniOnLoadAddr, {
    onEnter: function(args) {
      var shadowJavaVM = NULL;
      var javaVM = ptr(args[0]);

      if (!threads.hasJavaVM()) {
        threads.setJavaVM(javaVM);
      }

      if (!javaVMInterceptor.isInitialised()) {
        shadowJavaVM = javaVMInterceptor.create();
      } else {
        shadowJavaVM = javaVMInterceptor.get();
      }

      args[0] = shadowJavaVM;
    }
  });
}

function interceptJNIFunction(jniFunctionAddr) {
  return Interceptor.attach(jniFunctionAddr, {
    onEnter: function(args) {
      var shadowJNIEnv = NULL;
      var threadId = this.threadId;
      var jniEnv = ptr(args[0]);

      threads.setJNIEnv(threadId, jniEnv);

      if (!jniEnvInterceptor.isInitialised()) {
        shadowJNIEnv = jniEnvInterceptor.create();
      } else {
        shadowJNIEnv = jniEnvInterceptor.get();
      }

      args[0] = shadowJNIEnv;
    }
  });
}

var dlopenRef = Module.findExportByName(null, "dlopen");
var dlsymRef = Module.findExportByName(null, "dlsym");
var dlcloseRef = Module.findExportByName(null, "dlclose");

if (dlopenRef && dlsymRef && dlcloseRef) {
  var dlopen = new NativeFunction(dlopenRef, "pointer", ["pointer", "int"]);
  Interceptor.attach(dlopen, {
    onEnter: function(args) {
      var path = Memory.readCString(args[0]);
      if (checkLibrary(path)) {
        this.addHandle = true;
      }
    },
    onLeave: function(retval) {
      if (this.addHandle) {
        trackedLibs[ptr(retval)] = true;
      }
    }
  });

  var dlsym = new NativeFunction(dlsymRef, "pointer", ["pointer", "pointer"]);
  Interceptor.attach(dlsym, {
    onEnter: function(args) {
      this.handle = ptr(args[0]);
      if (trackedLibs[args[0]]) {
        this.symbol = Memory.readCString(args[1]);
      }
    },
    onLeave: function(retval) {
      if (retval.isNull()) {
        return;
      }

      if (trackedLibs[this.handle]) {
        if (this.symbol === "JNI_OnLoad") {
          interceptJNIOnLoad(ptr(retval));
        } else if (this.symbol.startsWith("Java_")) {
          interceptJNIFunction(ptr(retval));
        }
      } else {
        var name = libsToTrack[0];

        if (name !== "*") {
          var mod = Process.findModuleByAddress(retval);
          name = mod.name;
        }

        if (libsToTrack.indexOf(name) > -1 || name === "*") {
          interceptJNIFunction(ptr(retval));
        }
      }
    }
  });

  var dlclose = new NativeFunction(dlcloseRef, "int", ["pointer"]);
  Interceptor.attach(dlclose, {
    onEnter: function(args) {
      var handle = ptr(args[0]);
      if (trackedLibs[handle]) {
        this.handle = handle;
      }
    },
    onLeave: function(retval) {
      if (this.handle) {
        if (retval.isNull()) {
          delete trackedLibs[this.handle];
        }
      }
    }
  });
}

if (libsToTrack.length > 0) {
  console.error("Welcome to jnitrace. Tracing is running...");
  console.warn("NOTE: the recommended way to run this module is using the " +
               "python wrapper. It provides nicely formated coloured output " +
               "in the form of frida-trace. To get jnitrace run " +
               "'pip install jnitrace' or go to " +
               "'https://github.com/chame1eon/jnitrace'");
}
