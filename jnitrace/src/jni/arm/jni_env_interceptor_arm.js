var JNIEnvInterceptor = require("../jni_env_interceptor");
var Types = require("../../utils/types");

function JNIEnvInterceptorARM(references, threads, transport) {
  this.references = references;
  this.threads = threads;
  this.transport = transport;

  this.vaList = NULL;
  this.vaListOffset = 0;
}

JNIEnvInterceptorARM.prototype = new JNIEnvInterceptor();

JNIEnvInterceptorARM.prototype.createStubFunction = function() {
  var stub = Memory.alloc(Process.pageSize);

  Memory.patchCode(stub, Process.pageSize, function(code) {
    var cw = new ArmWriter(code, { pc: stub });

    cw.putInstruction(0xe52de004);
    cw.putInstruction(0xe49df004);

  });

  return stub;
}

JNIEnvInterceptorARM.prototype.buildVaArgParserShellcode =
  function(text, data, parser) {
    Memory.writePointer(text.add(0x400), parser);

    Memory.patchCode(text, Process.pageSize, function(code) {
      var cw = new ArmWriter(code, { pc: text });
      var dataOffset = 0;

      // str r0, [pc, #0x400]
      cw.putInstruction(0xe58f0400);
      // str r1, [pc, #0x400]
      cw.putInstruction(0xe58f1400);
      // str r2, [pc, #0x400]
      cw.putInstruction(0xe58f2400);
      // str r3, [pc, #0x400]
      cw.putInstruction(0xe58f3400);
      // str lr, [pc, #0x400]
      cw.putInstruction(0xe58fe400);

      // ldr r0, [pc, #0x3e4]
      cw.putInstruction(0xe59f03e4);
      // blx r0
      cw.putInstruction(0xe12fff30);

      // ldr r1, [pc, 0x3e0]
      cw.putInstruction(0xe59f13e8);
      // ldr r2, [pc, 0x3e0]
      cw.putInstruction(0xe59f23e8);
      // ldr r3, [pc, 0x3e0]
      cw.putInstruction(0xe59f33e8);

      //blx r0
      cw.putInstruction(0xe12fff30);

      // ldr r1, [pc, #0x3e4]
      cw.putInstruction(0xe59f13e4);

      // bx r1
      cw.putInstruction(0xe12fff11);

      cw.flush();
    });

    // required to prevent a crash on arm
    Interceptor.attach(text.add(56), function() {});
  }

JNIEnvInterceptorARM.prototype.setUpVaListArgExtract = function(vaList) {
  this.vaList = vaList;
  this.vaListOffset = 0;
}

JNIEnvInterceptorARM.prototype.extractVaListArgValue =
  function(method, paramId) {
    var currentPtr = this.vaList.add(this.vaListOffset);
    this.vaListOffset += Types.sizeOf(method.params[paramId]);
    return currentPtr;
  }

JNIEnvInterceptorARM.prototype.resetVaListArgExtract = function() {
  this.vaList = NULL;
  this.vaListOffset = 0;
}

JNIEnvInterceptorARM.prototype.processVaListRetVal =
  function(retType, retval, registers) {
    if (retType === "double" || retType === "int64") {
      retval = registers.r1.toString().substring(2) +
                  registers.r0.toString().substring(2);
    }
    return retval;
  }

module.exports = JNIEnvInterceptorARM;
