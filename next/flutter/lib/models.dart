class Book {
  const Book({required this.id, required this.title, required this.author, required this.chapters, required this.progress});

  factory Book.fromJson(Map<String, dynamic> json) => Book(
        id: json['id'] as String,
        title: json['title'] as String,
        author: json['author'] as String? ?? '本地导入',
        chapters: (json['chapters'] as num?)?.toInt() ?? 0,
        progress: json['progress'] as String? ?? '未开始',
      );

  final String id;
  final String title;
  final String author;
  final int chapters;
  final String progress;
}

class Chapter {
  const Chapter({required this.index, required this.title});

  factory Chapter.fromJson(Map<String, dynamic> json) => Chapter(index: (json['index'] as num).toInt(), title: json['title'] as String);

  final int index;
  final String title;
}

class FilterRule {
  const FilterRule({required this.id, required this.search, required this.replacement});

  factory FilterRule.fromJson(Map<String, dynamic> json) => FilterRule(
        id: (json['id'] as num).toInt(),
        search: json['search'] as String,
        replacement: json['replacement'] as String? ?? '',
      );

  final int id;
  final String search;
  final String replacement;
}

class ReaderSettings {
  const ReaderSettings({this.theme = 0, this.font = 4, this.fontSize = 18, this.lineSpacing = .8, this.paragraphSpacing = 1, this.letterSpacing = 0, this.readWidth = 800, this.jumpDuration = 1000, this.infiniteLoading = false});

  factory ReaderSettings.fromJson(Map<String, dynamic> json) => ReaderSettings(
        theme: (json['theme'] as num?)?.toInt() ?? 0,
        font: (json['font'] as num?)?.toInt() ?? 4,
        fontSize: (json['fontSize'] as num?)?.toInt() ?? 18,
        lineSpacing: (json['lineSpacing'] as num?)?.toDouble() ?? .8,
        paragraphSpacing: (json['paragraphSpacing'] as num?)?.toDouble() ?? 1,
        letterSpacing: (json['letterSpacing'] as num?)?.toDouble() ?? 0,
        readWidth: (json['readWidth'] as num?)?.toInt() ?? 800,
        jumpDuration: (json['jumpDuration'] as num?)?.toInt() ?? 1000,
        infiniteLoading: json['infiniteLoading'] as bool? ?? false,
      );

  final int theme;
  final int font;
  final int fontSize;
  final double lineSpacing;
  final double paragraphSpacing;
  final double letterSpacing;
  final int readWidth;
  final int jumpDuration;
  final bool infiniteLoading;

  ReaderSettings copyWith({int? theme, int? font, int? fontSize, double? lineSpacing, double? paragraphSpacing, double? letterSpacing, int? readWidth, int? jumpDuration, bool? infiniteLoading}) => ReaderSettings(
        theme: theme ?? this.theme,
        font: font ?? this.font,
        fontSize: fontSize ?? this.fontSize,
        lineSpacing: lineSpacing ?? this.lineSpacing,
        paragraphSpacing: paragraphSpacing ?? this.paragraphSpacing,
        letterSpacing: letterSpacing ?? this.letterSpacing,
        readWidth: readWidth ?? this.readWidth,
        jumpDuration: jumpDuration ?? this.jumpDuration,
        infiniteLoading: infiniteLoading ?? this.infiniteLoading,
      );

  Map<String, dynamic> toJson() => {'theme': theme, 'font': font, 'fontSize': fontSize, 'lineSpacing': lineSpacing, 'paragraphSpacing': paragraphSpacing, 'letterSpacing': letterSpacing, 'readWidth': readWidth, 'jumpDuration': jumpDuration, 'infiniteLoading': infiniteLoading};
}

class ReaderBook {
  const ReaderBook({required this.id, required this.title, required this.author, required this.current, required this.position, required this.chapters, required this.filters, required this.chapterTitle, required this.content});

  factory ReaderBook.fromJson(Map<String, dynamic> json) {
    final chapter = json['chapter'] as Map<String, dynamic>;
    return ReaderBook(
      id: json['id'] as String,
      title: json['title'] as String,
      author: json['author'] as String,
      current: (json['current'] as num).toInt(),
      position: (json['position'] as num?)?.toInt() ?? 0,
      chapters: (json['chapters'] as List<dynamic>).map((item) => Chapter.fromJson(item as Map<String, dynamic>)).toList(),
      filters: (json['filters'] as List<dynamic>).map((item) => FilterRule.fromJson(item as Map<String, dynamic>)).toList(),
      chapterTitle: chapter['title'] as String,
      content: chapter['content'] as String,
    );
  }

  final String id;
  final String title;
  final String author;
  final int current;
  final int position;
  final List<Chapter> chapters;
  final List<FilterRule> filters;
  final String chapterTitle;
  final String content;
}
