import 'dart:convert';
import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

typedef _CommandNative = Pointer<Utf8> Function(Pointer<Utf8> request);
typedef _CommandDart = Pointer<Utf8> Function(Pointer<Utf8> request);
typedef _FreeNative = Void Function(Pointer<Utf8> value);
typedef _FreeDart = void Function(Pointer<Utf8> value);

class CoreException implements Exception {
  const CoreException(this.message);
  final String message;

  @override
  String toString() => message;
}

class CoreApi {
  CoreApi() {
    try {
      final library = DynamicLibrary.open(_libraryName);
      _command = library.lookupFunction<_CommandNative, _CommandDart>('legado_command');
      _free = library.lookupFunction<_FreeNative, _FreeDart>('legado_free');
    } on Object catch (_) {
      _command = null;
      _free = null;
    }
  }

  static String get _libraryName {
    if (Platform.isWindows) return 'legado_core.dll';
    if (Platform.isMacOS) return 'liblegado_core.dylib';
    return 'liblegado_core.so';
  }

  _CommandDart? _command;
  _FreeDart? _free;

  bool get isAvailable => _command != null && _free != null;

  Map<String, dynamic> call(Map<String, dynamic> request) {
    final command = _command;
    final free = _free;
    if (command == null || free == null) {
      throw const CoreException('Rust 核心未加载，请确认 legado_core 动态库与应用位于同一目录。');
    }
    final input = jsonEncode(request).toNativeUtf8();
    final output = command(input);
    calloc.free(input);
    try {
      final response = jsonDecode(output.toDartString()) as Map<String, dynamic>;
      if (response['ok'] != true) {
        throw CoreException(response['error']?.toString() ?? '本地核心操作失败');
      }
      return (response['data'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    } finally {
      free(output);
    }
  }
}
