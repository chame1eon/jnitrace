function Types() {}

Types.sizeOf = function(type) {
  if (type === "double" || type === "float" || type === "int64") {
    return 8;
  } else if (type === "char") {
    return 1;
  } else {
    return Process.pointerSize;
  }
};

Types.convertNativeJTypeToFridaType = function(jtype) {
  if (jtype.indexOf("*") > -1) {
    return "pointer";
  }
  if (jtype === "jmethodID") {
    return "pointer";
  }
  if (jtype === "jfieldID") {
    return "pointer";
  }
  if (jtype === "va_list") {
    return "va_list";
  }
  if (jtype === "jweak") {
    jtype = "jobject";
  }
  if (jtype === "jthrowable") {
    jtype = "jobject";
  }
  if (jtype.indexOf("Array") > -1) {
    jtype = "jarray";
  }
  if (jtype === "jarray") {
    jtype = "jobject";
  }
  if (jtype === "jstring") {
    jtype = "jobject";
  }
  if (jtype === "jclass") {
    jtype = "jobject";
  }
  if (jtype === "jobject") {
    return "pointer";
  }
  if (jtype === "jsize") {
    jtype = "jint";
  }
  if (jtype === "jdouble") {
    return "double";
  }
  if (jtype === "jfloat") {
    return "float";
  }
  if (jtype === "jchar") {
    return "uint16";
  }
  if (jtype === "jboolean") {
    return "char";
  }
  if (jtype === "jlong") {
    return "int64";
  }
  if (jtype === "jint") {
    return "int";
  }
  if (jtype === "jshort") {
    return "int16";
  }
  if (jtype === "jbyte") {
    return "char";
  }

  return jtype;
};

Types.convertJTypeToNativeJType = function(jtype, isArray) {
  var primitiveTypes = ["B", "S", "I", "J", "F", "D", "C", "Z"];
  var result = "";

  if (jtype === "B") {
    result += "jbyte";
  } else if (jtype === "S") {
    result += "jshort";
  } else if (jtype === "I") {
    result += "jint";
  } else if (jtype === "J") {
    result += "jlong";
  } else if (jtype === "F") {
    result += "jfloat";
  } else if (jtype === "D") {
    result += "jdouble";
  } else if (jtype === "C") {
    result += "jchar";
  } else if (jtype === "Z") {
    result += "jboolean";
  } else if (jtype.charAt(0) === "L") {
    if (jtype === "Ljava/lang/String;") {
      result += "jstring";
    } else if(jtype === "Ljava/lang/Class;") {
      result += "jclass";
    } else {
      result += "jobject";
    }
  }

  if (isArray) {
    if (result === "jstring") {
      result = "jobject";
    }
    result += "Array";
  }

  return result;
};

module.exports = Types;
