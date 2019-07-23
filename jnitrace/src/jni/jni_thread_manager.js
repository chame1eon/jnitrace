function JNIThreadManager() {
  this.threads = {};
  this.shadowJavaVM = NULL;
}

JNIThreadManager.prototype.createEntry = function(threadId) {
  if (!this.threads[threadId]) {
    this.threads[threadId] = {
      'jniEnv': NULL
    }
  }
  return this.threads[threadId];
}

JNIThreadManager.prototype.getJavaVM = function() {
  return this.shadowJavaVM;
}

JNIThreadManager.prototype.hasJavaVM = function() {
  return !this.shadowJavaVM.isNull()
}

JNIThreadManager.prototype.setJavaVM = function(javaVM) {
  this.shadowJavaVM = javaVM;
}

JNIThreadManager.prototype.getJNIEnv = function(threadId) {
  var entry = this.createEntry(threadId);
  return entry.jniEnv;
}

JNIThreadManager.prototype.hasJNIEnv = function(threadId) {
  return !this.getJNIEnv(threadId).isNull();
}

JNIThreadManager.prototype.setJNIEnv = function(threadId, jniEnv) {
  var entry = this.createEntry(threadId);
  entry.jniEnv = jniEnv;
}

JNIThreadManager.prototype.needsJNIEnvUpdate = function(threadId, jniEnv) {
  var entry = this.createEntry(threadId);
  if (!entry.jniEnv.equals(jniEnv)) {
    return true;
  }
  return false;
}

module.exports = JNIThreadManager;
