var JNI_ENV_METHODS = require("../data/jni_env.json");
var Types = require("../utils/types");
var JavaMethod = require("../utils/java_method");

function JNIEnvInterceptor(references, threads, transport) {
  this.references = references;
  this.threads = threads;
  this.transport = transport;

  this.javaVMInterceptor = NULL;
}

JNIEnvInterceptor.prototype.shadowJNIEnv = null;
JNIEnvInterceptor.prototype.methods = {};
JNIEnvInterceptor.prototype.fastMethodLookup = {};

JNIEnvInterceptor.prototype.isInitialised = function() {
  return this.shadowJNIEnv !== null;
}

JNIEnvInterceptor.prototype.get = function() {
  return this.shadowJNIEnv;
}

JNIEnvInterceptor.prototype.createJNIIntercept = function(id, methodAddr) {
  var self = this;
  var method = JNI_ENV_METHODS[id];
  var fridaArgs = [];

  for (var j = 0; j < method.args.length; j++) {
    var ftype = Types.convertNativeJTypeToFridaType(method.args[j]);
    if (ftype !== "va_list") {
      fridaArgs.push(ftype);
    }
  }
  var fridaRet = Types.convertNativeJTypeToFridaType(method.ret);

  var nativeFunction = new NativeFunction(methodAddr, fridaRet, fridaArgs);
  var nativeCallback = new NativeCallback(function() {
    var threadId = this.threadId;
    var localArgs = [].slice.call(arguments);
    var jniEnv = self.threads.getJNIEnv(threadId);

    localArgs[0] = jniEnv;

    var ret = nativeFunction.apply(null, localArgs);

    var add = null;

    if (method.args[method.args.length - 1] === "jvalue*") {
      add = self.methods[ptr(localArgs[2])].javaParams;
      var jvalues = ptr(localArgs[method.args.length - 1]);
      localArgs = localArgs.slice(0, -1);

      for (var i = 0; i < add.length; i++) {
        var val = NULL;
        var type = Types.convertNativeJTypeToFridaType(add[i]);

        var val = self.readValue(jvalues.add(8 * i), type);

        localArgs.push(val);
      }
    }

    self.transport.trace(method, localArgs, ret, this.context, add);

    if (method.name === "GetMethodID" ||
        method.name === "GetStaticMethodID") {
      var signature = Memory.readCString(localArgs[3]);
      var types = new JavaMethod(signature);
      var fridaTypes = {
        params: [],
        javaParams: [],
        ret: NULL
      };

      for (var i = 0; i < types.params.length; i++) {
        var nativeJType = Types.convertJTypeToNativeJType(types.params[i]);
        var fridaType = Types.convertNativeJTypeToFridaType(nativeJType);

        fridaTypes.params.push(fridaType);
        fridaTypes.javaParams.push(
          Types.convertJTypeToNativeJType(types.params[i])
        );
      }

      var jTypeRet = Types.convertJTypeToNativeJType(types.ret);
      fridaTypes.ret = Types.convertNativeJTypeToFridaType(jTypeRet);

      self.methods[ret] = fridaTypes;

    } else if (method.name === "GetJavaVM") {
      var javaVM = NULL;

      if (ret === 0) {
        self.threads.setJavaVM(Memory.readPointer(localArgs[1]));
      }

      if (!self.javaVMInterceptor.isInitialised()) {
        javaVM = self.javaVMInterceptor.create();
      } else {
        javaVM = self.javaVMInterceptor.get();
      }

      Memory.writePointer(localArgs[1], javaVM);
    } else if (method.name === "RegisterNatives") {
      var methods = localArgs[2];
      var size = localArgs[3];
      for (var i = 0; i < size * 3; i += 3) {
        var offset = (i + 2) * Process.pointerSize;
        var addr = Memory.readPointer(methods.add(offset));

        Interceptor.attach(addr, {
          onEnter: function(args) {
            if (!self.threads.hasJNIEnv(this.threadId)) {
              self.threads.setJNIEnv(this.threadId, ptr(args[0]));
            }
            args[0] = ptr(self.shadowJNIEnv);
          }
        });
      }
    }

    return ret;
  }, fridaRet, fridaArgs);

  this.references.add(nativeCallback);

  return nativeCallback;
}

JNIEnvInterceptor.prototype.createJNIVarArgIntercept =
  function(id, methodAddr) {
    var self = this;
    var method = JNI_ENV_METHODS[id];

    var text = Memory.alloc(Process.pageSize);
    var data = Memory.alloc(Process.pageSize);

    var vaArgsCallback = NULL;
    var mainCallback = NULL;

    this.references.add(text);
    this.references.add(data);

    vaArgsCallback = new NativeCallback(function() {
      var callbackParams = [];
      var originalParams = [];
      var methodId = arguments[2];
      var vaArgs = self.methods[methodId];

      if (self.fastMethodLookup[methodId]) {
        return self.fastMethodLookup[methodId];
      }

      for (var i = 0; i < method.args.length - 1; i++) {
        var fridaType = Types.convertNativeJTypeToFridaType(method.args[i]);

        callbackParams.push(fridaType);
        originalParams.push(fridaType);
      }

      originalParams.push("...");

      for (var i = 0; i < vaArgs.params.length; i++) {
        if (vaArgs.params[i] === "float") {
          callbackParams.push("double");
        } else {
          callbackParams.push(vaArgs.params[i]);
        }

        originalParams.push(vaArgs.params[i]);
      }

      var retType = Types.convertNativeJTypeToFridaType(method.ret);

      mainCallback = new NativeCallback(function() {
        var threadId = this.threadId;
        var localArgs = [].slice.call(arguments);
        var jniEnv = self.threads.getJNIEnv(threadId);

        localArgs[0] = jniEnv;

        var ret = new NativeFunction(methodAddr,
                                      retType,
                                      originalParams).apply(null, localArgs);

        self.transport.trace(method,
                              localArgs,
                              ret,
                              this.context,
                              vaArgs.javaParams);

        return ret;
      }, retType, callbackParams);

      self.references.add(mainCallback);

      self.fastMethodLookup[methodId] = mainCallback;

      return mainCallback;
    }, "pointer", ["pointer", "pointer", "pointer"]);

    this.references.add(vaArgsCallback);

    self.buildVaArgParserShellcode(text, data, vaArgsCallback);

    return text;
  }

JNIEnvInterceptor.prototype.processVaListRetVal =
  function(retType, retval, registers) {
    return retval;
  }

JNIEnvInterceptor.prototype.createJNIVaListIntercept =
  function(id, methodAddr) {
    var self = this;
    var methodData = JNI_ENV_METHODS[id];

    var retType = Types.convertNativeJTypeToFridaType(methodData.ret);

    Interceptor.attach(methodAddr, {
      onEnter: function(args) {
        var threadId = this.threadId;

        this.shadowJNIEnv = self.threads.getJNIEnv(threadId);
        this.localJNIEnv = ptr(args[0]);

        if (!this.shadowJNIEnv.isNull() &&
              !this.localJNIEnv.equals(this.shadowJNIEnv)) {
          this.enterCtx = this.context;
          this.methodId = ptr(args[2]);
          var vaList = ptr(args[3]);

          this.args = [
            this.localJNIEnv,
            args[1],
            this.methodId
          ];
          this.ret = NULL;

          var method = self.methods[this.methodId];

          if (!method) {
            return;
          }

          self.setUpVaListArgExtract(vaList);

          for (var i = 0; i < method.params.length; i++) {
            var currentPtr = self.extractVaListArgValue(method, i);

            var val = self.readValue(currentPtr, method.params[i], true);

            this.args.push(val);
          }

          self.resetVaListArgExtract();

          args[0] = this.shadowJNIEnv;
        }
      },
      onLeave: function(originalRet) {
        if (!this.shadowJNIEnv.isNull() &&
              !this.localJNIEnv.equals(this.shadowJNIEnv)) {
          var ret = NULL;
          var retval = self.processVaListRetVal(retType,
                                                  ptr(originalRet),
                                                  this.context);

          if (retType === "int8") {
            ret = retval.toInt32();
          } else if (retType === "int16") {
            ret = retval.toInt32();
          } else if (retType === "uint16") {
            ret = retval.toInt32();
          } else if (retType === "int32") {
            ret = retval.toInt32();
          } else if (retType === "int64") {
            ret = uint64("0x" + retval.toString());
          } else if (retType === "float") {
            var buf = Memory.alloc(Types.sizeOf(retType));
            Memory.writeS32(buf, retval.toInt32());
            ret = Memory.readFloat(buf);
          } else if (retType === "double") {
            var buf = Memory.alloc(Types.sizeOf(retType));
            Memory.writeU64(buf, uint64("0x" + retval.toString()));
            ret = Memory.readDouble(buf);
          }

          var add = self.methods[this.methodId].javaParams;

          self.transport.trace(methodData, this.args, ret, this.enterCtx, add);
        }
      }
    });

    return methodAddr;
  }

JNIEnvInterceptor.prototype.readValue = function(currentPtr, type, extend) {
  var val = NULL;

  if (type === "char") {
    val = Memory.readS8(currentPtr);
  } else if (type === "int16") {
    val = Memory.readS16(currentPtr);
  } else if (type === "uint16") {
    val = Memory.readU16(currentPtr);
  } else if (type === "int") {
    val = Memory.readS32(currentPtr);
  } else if (type === "int64") {
    val = Memory.readS64(currentPtr);
  } else if (type === "float") {
    if (extend) {
      val = Memory.readDouble(currentPtr);
    } else {
      val = Memory.readFloat(currentPtr);
    }
  } else if (type === "double") {
    val = Memory.readDouble(currentPtr);
  } else if (type === "pointer") {
    val = Memory.readPointer(currentPtr);
  }

  return val;
}

JNIEnvInterceptor.prototype.setJavaVMInterceptor = function(javaVMInterceptor) {
  this.javaVMInterceptor = javaVMInterceptor;
}

JNIEnvInterceptor.prototype.createStubFunction = function() {
  return new NativeCallback(function() {}, 'void', []);
}

JNIEnvInterceptor.prototype.create = function() {
  var threadId = Process.getCurrentThreadId();
  var jniEnv = this.threads.getJNIEnv(threadId);
  var jniEnvOffset = 4;
  var jniEnvLength = 232;

  var newJNIEnvStruct = Memory.alloc(Process.pointerSize * jniEnvLength);
  this.references.add(newJNIEnvStruct);

  var newJNIEnv = Memory.alloc(Process.pointerSize);
  Memory.writePointer(newJNIEnv, newJNIEnvStruct);
  this.references.add(newJNIEnv);

  for (var i = jniEnvOffset; i < jniEnvLength; i++) {
    var method = JNI_ENV_METHODS[i];
    var offset = i * Process.pointerSize;
    var jniEnvStruct = Memory.readPointer(jniEnv);
    var methodAddr = Memory.readPointer(jniEnvStruct.add(offset));

    if (method.args[method.args.length - 1] === "...") {
      var callback = this.createJNIVarArgIntercept(i, methodAddr);
      var trampoline = this.createStubFunction();
      this.references.add(trampoline);
      // ensure the CpuContext will be populated
      Interceptor.replace(trampoline, callback);
      Memory.writePointer(newJNIEnvStruct.add(offset), trampoline);
    } else if (method.args[method.args.length - 1] === "va_list") {
      var callback = this.createJNIVaListIntercept(i, methodAddr);
      Memory.writePointer(newJNIEnvStruct.add(offset), callback);
    } else {
      var callback = this.createJNIIntercept(i, methodAddr);
      var trampoline = this.createStubFunction();
      this.references.add(trampoline);
      // ensure the CpuContext will be populated
      Interceptor.replace(trampoline, callback);
      Memory.writePointer(newJNIEnvStruct.add(offset), trampoline);
    }
  }

  this.shadowJNIEnv = newJNIEnv;

  return newJNIEnv;
}

module.exports = JNIEnvInterceptor;
