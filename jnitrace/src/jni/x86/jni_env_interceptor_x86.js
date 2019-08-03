var JNIEnvInterceptor = require("../jni_env_interceptor");
var Types = require("../../utils/types");

function JNIEnvInterceptorX86(references, threads, transport) {
  this.references = references;
  this.threads = threads;
  this.transport = transport;

  this.vaList = NULL;
  this.vaListOffset = 0;
}

JNIEnvInterceptorX86.prototype = new JNIEnvInterceptor();

JNIEnvInterceptorX86.prototype.buildVaArgParserShellcode =
  function(text, data, parser) {
    Memory.writePointer(text.add(0x400), parser);

    Memory.patchCode(text, Process.pageSize, function(code) {
      var cw = new X86Writer(code, { pc: text });
      var dataOffset = 0x400 + Process.pointerSize;

      cw.putPopReg("eax");
      cw.putMovNearPtrReg(text.add(dataOffset + Process.pointerSize), "eax");

      cw.putCallAddress(parser);

      cw.putCallReg("eax");

      cw.putJmpNearPtr(text.add(dataOffset + Process.pointerSize));

      cw.flush();
    });
  }

JNIEnvInterceptorX86.prototype.setUpVaListArgExtract = function(vaList) {
  this.vaList = vaList;
  this.vaListOffset = 0;
}

JNIEnvInterceptorX86.prototype.extractVaListArgValue =
  function(method, paramId) {
    var currentPtr = this.vaList.add(this.vaListOffset);
    this.vaListOffset += Types.sizeOf(method.params[paramId]);
    return currentPtr;
  }

JNIEnvInterceptorX86.prototype.resetVaListArgExtract = function() {
  this.vaList = NULL;
  this.vaListOffset = 0;
}

JNIEnvInterceptorX86.prototype.processVaListRetVal =
  function(retType, retval, registers) {
    if (retType === "int64") {
      retval = registers.edx.toString().substring(2) +
                  registers.eax.toString().substring(2);
    } else if (retType === "double" || retType === "float") {
      //TODO - currently does not support floating point returns on x86
    }
    return retval;
  }

module.exports = JNIEnvInterceptorX86;
