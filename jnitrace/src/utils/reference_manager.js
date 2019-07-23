function ReferenceManager() {
  this.references = {};
}

ReferenceManager.prototype.add = function(ref) {
  this.references[ref] = ref;
}

ReferenceManager.prototype.release = function(ref) {
  if (this.references[ref]) {
    delete this.references[ref];
  }
}

module.exports = ReferenceManager;
