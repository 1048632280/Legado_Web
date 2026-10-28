import 'package:flutter_test/flutter_test.dart';
import 'package:legado_next/models.dart';

void main() {
  group('ReaderSettings', () {
    test('uses offline reader defaults when stored values are missing', () {
      final settings = ReaderSettings.fromJson(const {});

      expect(settings.theme, 0);
      expect(settings.font, 4);
      expect(settings.fontSize, 18);
      expect(settings.readWidth, 800);
      expect(settings.infiniteLoading, isFalse);
    });

    test('copyWith and JSON round-trip preserve all setting values', () {
      final settings = const ReaderSettings().copyWith(
        theme: 6,
        fontSize: 24,
        lineSpacing: 1.2,
        paragraphSpacing: 2.5,
        letterSpacing: .4,
        readWidth: 960,
        jumpDuration: 500,
        infiniteLoading: true,
      );

      expect(ReaderSettings.fromJson(settings.toJson()).toJson(), settings.toJson());
    });
  });

  test('ReaderBook parses chapters, filters and the current chapter payload', () {
    final book = ReaderBook.fromJson({
      'id': 'book-1',
      'title': '离线小说',
      'author': '本地作者',
      'current': 1,
      'position': 128,
      'chapters': [
        {'index': 0, 'title': '第一章'},
        {'index': 1, 'title': '第二章'},
      ],
      'filters': [
        {'id': 3, 'search': '广告', 'replacement': ''},
      ],
      'chapter': {'title': '第二章', 'content': '正文内容'},
    });

    expect(book.current, 1);
    expect(book.position, 128);
    expect(book.chapters.map((chapter) => chapter.title), ['第一章', '第二章']);
    expect(book.filters.single.search, '广告');
    expect(book.chapterTitle, '第二章');
    expect(book.content, '正文内容');
  });
}
