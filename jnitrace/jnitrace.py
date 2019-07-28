"""
Main JNITrace python script to inject the JNITracing javascript into a target
process.
"""

import argparse

import frida
import hexdump

from pkg_resources import resource_string
from pkg_resources import require

from colorama import Fore, Style, init


__version__ = require("jnitrace")[0].version

init()

PALETTE = [
    Fore.CYAN,
    Fore.MAGENTA,
    Fore.YELLOW,
    Fore.GREEN,
    Fore.RED,
    Fore.BLUE
]

class Formatter: # pylint: disable=too-few-public-methods
                 # pylint: disable=too-many-instance-attributes
    """
    Formatter class to take output from the Frida script and print it in
    a readable way for the user.
    """
    def __init__(self, _show_backtrace, _show_data):
        self._show_backtrace = _show_backtrace
        self._show_data = _show_data
        self._jclasses = {}
        self._jmethods = {}
        self._jfields = {}

        self._current_color = None
        self._next_color = 0
        self._thread_colors = {}
        self._is_64b = False

    def _update_current_color(self, thread_id):
        color = self._thread_colors.get(thread_id)
        if not color:
            color = PALETTE[self._next_color]
            self._next_color += 1
            if self._next_color >= len(PALETTE):
                self._next_color = 0
            self._thread_colors[thread_id] = color
        self._current_color = color
        return color

    def _update_refs(self, method, args, ret):
        if method["name"] in ["GetMethodID", "GetStaticMethodID"]:
            method_id = ret
            self._jmethods[method_id] = {
                "name": args[2]["data"],
                "sig": args[3]["data"]
            }
        elif method["name"] in ["GetFieldID", "GetStaticFieldID"]:
            field_id = ret
            self._jfields[field_id] = {
                "name": args[2]["data"],
                "sig": args[3]["data"]
            }
        elif method["name"] in ["FindClass", "DefineClass"]:
            class_id = ret
            self._jclasses[class_id] = {
                "name": args[1]["data"]
            }

    def _print_thread_id(self, thread_id):
        print("{:15s}/* TID {:d} */{}".format(
            self._current_color,
            thread_id,
            Style.RESET_ALL
        ))

    def _print_method_name(self, t_s, name):
        print("{:6d} ms {}[+] {}{}".format(
            t_s,
            self._current_color,
            name,
            Style.RESET_ALL
        ))

    def _print_method_arg(self, t_s, arg_type, value):
        opt = None
        if arg_type == "jfieldID":
            val = value
            if val in self._jfields:
                opt = "{}:{}".format(self._jfields[val]["name"], self._jfields[val]["sig"])
            else:
                opt = "unknown"
        elif arg_type == "jmethodID":
            val = value
            if val in self._jmethods:
                opt = "{}{}".format(self._jmethods[val]["name"], self._jmethods[val]["sig"])
            else:
                opt = "unknown"
        elif arg_type == "jclass":
            val = value
            if val in self._jclasses:
                opt = self._jclasses[val]["name"]
            else:
                opt = "unknown"

        if opt:
            print("{:6d} ms {}|- {:12s}: {}  {{ {} }}{}".format(
                t_s,
                self._current_color,
                arg_type,
                value,
                opt,
                Style.RESET_ALL
            ))
        else:
            print("{:6d} ms {}|- {:12s}: {}{}".format(
                t_s,
                self._current_color,
                arg_type,
                value,
                Style.RESET_ALL
            ))

    def _print_additional_data(self, t_s, method, arg, data):
        if method["name"] == "RegisterNatives" and \
            "data" in arg:

            for jni_method in arg["data"]:
                print("{:6d} ms {}|:   {}: {}{}{}".format(
                    t_s,
                    self._current_color,
                    jni_method["addr"]["value"],
                    jni_method["name"]["data"],
                    jni_method["sig"]["data"],
                    Style.RESET_ALL
                ))
        else:
            h_d_data = None
            if "data_for" in arg:
                h_d_data = data
            elif "data" in arg:
                h_d_data = arg["data"].encode()

            if h_d_data:
                h_d = hexdump.hexdump(h_d_data, result="return").split("\n")
                for line in h_d:
                    print("{:6d} ms {}|:   {}{}".format(
                        t_s,
                        self._current_color,
                        line[1:],
                        Style.RESET_ALL
                    ))

    def _print_backtrace(self, t_s, backtrace):
        padding = "-" * 25
        print("{:6d} ms {}{padding}Backtrace{padding}{}".format(
            t_s,
            self._current_color,
            Style.RESET_ALL,
            padding=padding
        ))

        for b_t in backtrace:
            if not b_t["module"]:
                break
            if len(b_t["address"]) > 10:
                self._is_64b = True

            if self._is_64b:
                print("{:6d} ms {}|-> {:>18s}: {} ({}){}".format(
                    t_s,
                    self._current_color,
                    b_t["address"],
                    b_t["module"]["path"],
                    b_t["module"]["base"],
                    Style.RESET_ALL
                ))
            else:
                print("{:6d} ms {}|-> {:>10s}: {} ({}){}".format(
                    t_s,
                    self._current_color,
                    b_t["address"],
                    b_t["module"]["path"],
                    b_t["module"]["base"],
                    Style.RESET_ALL
                ))

        print()

    def on_message(self, message, data):
        """
        Frida on_message callback, for formatting output data.
        :param message - JSON formatted output
        :param data - binary data for some JNI method calls
        """
        if message["type"] != "send":
            print("{}ERROR: {}{}".format(
                Fore.RED,
                str(message),
                Style.RESET_ALL
            ))
            return

        payload = message["payload"]
        t_s = payload["timestamp"]
        method = payload["method"]
        args = payload["args"]

        self._update_refs(method, args, payload.get("ret"))

        self._update_current_color(payload["threadId"])

        self._print_thread_id(payload["threadId"])
        self._print_method_name(t_s, method["name"])

        args = payload["args"]
        add_java_args = False
        jni_args = method["args"]

        for i, _ in enumerate(jni_args):
            arg_type = method["args"][i]
            if arg_type in ["va_list", "...", "jvalue*"]:
                add_java_args = True
                break

            arg = args[i]

            self._print_method_arg(
                t_s,
                arg_type,
                arg["value"]
            )

            if self._show_data:
                self._print_additional_data(
                    t_s,
                    method,
                    arg,
                    data
                )



        if add_java_args:
            additional_params = payload["additional_params"]
            for i, _ in enumerate(additional_params):
                arg = args[i + len(jni_args) - 1]
                self._print_method_arg(
                    t_s,
                    additional_params[i],
                    arg["value"])

        if payload.get("ret"):
            print("{:6d} ms {}|= {:12s}: {}{}".format(
                t_s,
                self._current_color,
                method["ret"],
                payload.get("ret"),
                Style.RESET_ALL
            ))
        print()

        if self._show_backtrace:
            self._print_backtrace(t_s, payload["backtrace"])

        print()

def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--inject", choices=["spawn", "attach"],
                        default="spawn",
                        help="Specify how frida should inject into the "
                        "process.")
    parser.add_argument("-l", "--libraries", required=True, nargs="+",
                        help="Specify a list of native libraries to track JNI "
                        "calls from. Enter * to track all libraries.")
    parser.add_argument("-b", "--backtrace", choices=["fuzzy", "accurate"],
                        help="Print a backtrace from each JNI call.")
    parser.add_argument("-d", "--data", action="store_true",
                        help="Print contents of argument.")
    parser.add_argument("-p", "--process", required=True,
                        help="The name of the process to trace.")
    parser.add_argument("-v", "--version", action='version',
                        version="%(prog)s " + __version__,
                        help="Show the installed version of jnitrace.")
    return parser.parse_args()

def main():
    """
    Main function to process command arguments and to inject Frida.
    """
    jscode = resource_string("jnitrace.build", "jnitrace.js").decode()
    jscode = jscode.replace("var libsToTrack = ['*'];", "var libsToTrack = [];")

    args = _parse_args()

    b_t = False

    if args.backtrace == "accurate":
        jscode = jscode.replace("Backtracer.FUZZY", "Backtracer.ACCURATE")
        b_t = True
    elif args.backtrace == "fuzzy":
        b_t = True

    formatter = Formatter(b_t, args.data)

    device = frida.get_usb_device(3)
    if args.inject == "spawn":
        pid = device.spawn([args.process])
    else:
        pid = device.attach(args.process)

    session = device.attach(pid)
    script = session.create_script(jscode)
    script.on('message', formatter.on_message)
    script.load()
    script.post({
        "type": "libraries",
        "payload": args.libraries
    })

    if args.inject == "spawn":
        device.resume(pid)

    print("{}Tracing. Press any key to quit...{}".format(
        Fore.GREEN,
        Style.RESET_ALL
    ))
    input()

if __name__ == '__main__':
    main()
