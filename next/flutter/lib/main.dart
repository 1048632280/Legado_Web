import 'dart:async';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import 'core_api.dart';
import 'models.dart';

const _ink = Color(0xFF18181B);
const _muted = Color(0xFF64748B);
const _canvas = Color(0xFFF6F7F9);
const _accent = Color(0xFFE35368);

void main() {
  runApp(LegadoApp(controller: AppController(CoreApi())));
}

class AppController extends ChangeNotifier {
  AppController(this.api);

  final CoreApi api;
  List<Book> books = const [];
  ReaderBook? reader;
  ReaderSettings settings = const ReaderSettings();
  String search = '';
  String status = '';
  bool busy = true;
  String? error;

  Future<void> init() async {
    await _run(() async {
      settings = ReaderSettings.fromJson(api.call({'op': 'get_settings'}));
      await reloadBooks();
    });
  }

  Future<void> reloadBooks() async {
    final data = api.call({'op': 'list_books', 'query': search});
    books = _listFromResponse(data).map(Book.fromJson).toList();
    notifyListeners();
  }

  Future<void> refreshSearch(String value) async {
    search = value;
    try {
      final response = api.call({'op': 'list_books', 'query': value});
      books = _listFromResponse(response).map(Book.fromJson).toList();
      error = null;
    } on Object catch (exception) {
      error = exception.toString();
    }
    notifyListeners();
  }

  List<Map<String, dynamic>> _listFromResponse(Map<String, dynamic> response) => (response['books'] as List<dynamic>? ?? const []).map((item) => (item as Map).cast<String, dynamic>()).toList();

  Future<void> importText() async {
    final file = await openFile(acceptedTypeGroups: [const XTypeGroup(label: 'TXT 文本', extensions: ['txt'])]);
    if (file == null) return;
    await _run(() async {
      api.call({'op': 'import_file', 'path': file.path});
      status = '已导入 ${file.name}';
      await reloadBooks();
    });
  }

  Future<void> openBook(Book book) async {
    await _run(() async {
      reader = ReaderBook.fromJson(api.call({'op': 'open_book', 'id': book.id}));
      status = '';
    });
  }

  Future<void> openRecent() async {
    if (books.isNotEmpty) await openBook(books.first);
  }

  Future<void> loadChapter(int index) async {
    final current = reader;
    if (current == null || index < 0 || index >= current.chapters.length) {
      return;
    }
    await _run(() async {
      final data = api.call({'op': 'chapter', 'id': current.id, 'index': index});
      reader = ReaderBook(id: current.id, title: current.title, author: current.author, current: index, position: 0, chapters: current.chapters, filters: current.filters, chapterTitle: data['title'] as String, content: data['content'] as String);
      await reloadBooks();
    });
  }

  Future<void> deleteBook(Book book) async {
    await _run(() async {
      api.call({'op': 'delete_book', 'id': book.id});
      if (reader?.id == book.id) {
        reader = null;
      }
      status = '已删除《${book.title}》';
      await reloadBooks();
    });
  }

  Future<void> clearAll() async {
    await _run(() async {
      api.call({'op': 'clear_all'});
      books = const [];
      reader = null;
      settings = const ReaderSettings();
      search = '';
      status = '本地数据已清空';
    });
  }

  Future<void> saveSettings(ReaderSettings value) async {
    settings = value;
    notifyListeners();
    try {
      api.call({'op': 'save_settings', 'settings': value.toJson()});
    } on Object catch (exception) {
      error = exception.toString();
      notifyListeners();
    }
  }

  Future<ReaderBook?> addFilter(String searchText, String replacement) async {
    final current = reader;
    if (current == null || searchText.trim().isEmpty) return current;
    ReaderBook? updated;
    await _run(() async {
      api.call({'op': 'add_filter', 'id': current.id, 'search': searchText, 'replacement': replacement});
      reader = ReaderBook.fromJson(api.call({'op': 'open_book', 'id': current.id}));
      updated = reader;
      status = '过滤规则已添加';
    });
    return updated;
  }

  Future<ReaderBook?> deleteFilter(int id) async {
    final current = reader;
    if (current == null) return null;
    ReaderBook? updated;
    await _run(() async {
      api.call({'op': 'delete_filter', 'id': id});
      reader = ReaderBook.fromJson(api.call({'op': 'open_book', 'id': current.id}));
      updated = reader;
      status = '过滤规则已删除';
    });
    return updated;
  }

  Future<void> saveProgress(int position) async {
    final current = reader;
    if (current == null) return;
    try {
      api.call({'op': 'save_progress', 'id': current.id, 'index': current.current, 'position': position});
    } on Object catch (exception) {
      error = exception.toString();
      notifyListeners();
    }
  }

  void closeReader() {
    reader = null;
    status = '';
    notifyListeners();
  }

  Future<void> _run(Future<void> Function() action) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
    } on Object catch (exception) {
      error = exception.toString();
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}

class LegadoApp extends StatefulWidget {
  const LegadoApp({super.key, required this.controller});
  final AppController controller;

  @override
  State<LegadoApp> createState() => _LegadoAppState();
}

class _LegadoAppState extends State<LegadoApp> {
  @override
  void initState() {
    super.initState();
    unawaited(widget.controller.init());
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: widget.controller,
        builder: (context, _) {
          final dark = widget.controller.settings.theme == 6;
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            title: '阅读',
            themeMode: dark ? ThemeMode.dark : ThemeMode.light,
            theme: _theme(Brightness.light),
            darkTheme: _theme(Brightness.dark),
            home: HomeShell(controller: widget.controller),
          );
        },
      );

  ThemeData _theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(seedColor: _accent, brightness: brightness).copyWith(surface: dark ? const Color(0xFF222326) : Colors.white);
    return ThemeData(colorScheme: scheme, brightness: brightness, useMaterial3: true, fontFamily: 'Microsoft YaHei', scaffoldBackgroundColor: dark ? const Color(0xFF17181B) : _canvas, inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(10))), filled: true, contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12)), visualDensity: VisualDensity.standard);
  }
}

class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.controller});
  final AppController controller;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        child: controller.reader == null ? ShelfPage(key: const ValueKey('shelf'), controller: controller) : ReaderPage(key: const ValueKey('reader'), controller: controller),
      );
}

class ShelfPage extends StatelessWidget {
  const ShelfPage({super.key, required this.controller});
  final AppController controller;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: LayoutBuilder(builder: (context, constraints) {
          final sidebarWidth = constraints.maxWidth < 900 ? 232.0 : 272.0;
          return Row(children: [SizedBox(width: sidebarWidth, child: ShelfSidebar(controller: controller)), Expanded(child: ShelfContent(controller: controller))]);
        }),
      );
}

class ShelfSidebar extends StatelessWidget {
  const ShelfSidebar({super.key, required this.controller});
  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final recent = controller.books.isEmpty ? null : controller.books.first;
    return DecoratedBox(
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, border: Border(right: BorderSide(color: Theme.of(context).dividerColor))),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('阅读', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: _ink)),
          const SizedBox(height: 4),
          Text('本地 TXT 阅读器', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: _muted)),
          const SizedBox(height: 24),
          TextField(decoration: const InputDecoration(hintText: '筛选本地书架', prefixIcon: Icon(Icons.search_rounded)), onChanged: controller.refreshSearch),
          const SizedBox(height: 28),
          Text('最近阅读', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: _muted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          Semantics(
            button: true,
            label: recent == null ? '暂无阅读记录' : '继续阅读 ${recent.title}',
            child: InkWell(
              onTap: recent == null ? null : () => controller.openBook(recent),
              borderRadius: BorderRadius.circular(10),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: recent == null ? Theme.of(context).colorScheme.surfaceContainerHighest : const Color(0xFFF0F6FC),
                  border: Border.all(color: recent == null ? Theme.of(context).dividerColor : const Color(0xFFC9D9EC)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(recent?.title ?? '暂无阅读记录', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: recent == null ? _muted : const Color(0xFF3975B5))),
              ),
            ),
          ),
          const SizedBox(height: 28),
          Text('本地数据', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: _muted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          FilledButton.icon(onPressed: controller.busy ? null : controller.importText, icon: const Icon(Icons.file_open_outlined), label: const Text('导入 TXT')),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: controller.books.isEmpty ? null : () => _confirmClear(context), icon: const Icon(Icons.delete_sweep_outlined), label: const Text('清空数据')),
          const Spacer(),
          Divider(color: Theme.of(context).dividerColor),
          const SizedBox(height: 10),
          Text('纯本地 · Rust + SQLite', textAlign: TextAlign.center, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: _muted)),
          Text('书籍与进度只保存在此设备', textAlign: TextAlign.center, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: _muted)),
        ]),
      ),
    );
  }

  Future<void> _confirmClear(BuildContext context) async {
    final yes = await showDialog<bool>(context: context, builder: (context) => AlertDialog(title: const Text('清空本地数据？'), content: const Text('书籍、阅读进度和过滤规则都会被删除，此操作不可撤销。'), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('清空'))]));
    if (yes == true) await controller.clearAll();
  }
}

class ShelfContent extends StatelessWidget {
  const ShelfContent({super.key, required this.controller});
  final AppController controller;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(32),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Text('我的书架', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)), const Spacer(), if (controller.status.isNotEmpty) Flexible(child: Text(controller.status, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: _muted)))]),
          const SizedBox(height: 20),
          if (controller.busy && controller.books.isEmpty) const Expanded(child: Center(child: CircularProgressIndicator())) else Expanded(child: controller.books.isEmpty ? EmptyShelf(searching: controller.search.isNotEmpty, onImport: controller.importText) : LayoutBuilder(builder: (context, constraints) => GridView.builder(padding: const EdgeInsets.only(bottom: 20), gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: constraints.maxWidth > 1000 ? 380 : 560, mainAxisExtent: 164, crossAxisSpacing: 16, mainAxisSpacing: 16), itemCount: controller.books.length, itemBuilder: (context, index) => BookCard(book: controller.books[index], onOpen: () => controller.openBook(controller.books[index]), onDelete: () => controller.deleteBook(controller.books[index])))))
        ]),
      );
}

class EmptyShelf extends StatelessWidget {
  const EmptyShelf({super.key, required this.searching, required this.onImport});
  final bool searching;
  final Future<void> Function() onImport;

  @override
  Widget build(BuildContext context) => Center(
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 720),
          padding: const EdgeInsets.all(48),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface.withValues(alpha: .8),
            border: Border.all(color: Theme.of(context).dividerColor),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(searching ? Icons.search_off_rounded : Icons.auto_stories_rounded, size: 44, color: _accent),
              const SizedBox(height: 16),
              Text(searching ? '没有找到匹配的书籍' : '导入 TXT 开始阅读', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(
                searching ? '请尝试其他书名或作者关键词。' : '选择本地 TXT 文件，导入后即可离线阅读。',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: _muted),
              ),
              if (!searching) ...[
                const SizedBox(height: 24),
                FilledButton.icon(onPressed: onImport, icon: const Icon(Icons.file_open_outlined), label: const Text('导入 TXT')),
              ],
            ],
          ),
        ),
      );
}

class BookCard extends StatefulWidget {
  const BookCard({super.key, required this.book, required this.onOpen, required this.onDelete});
  final Book book;
  final VoidCallback onOpen;
  final VoidCallback onDelete;

  @override
  State<BookCard> createState() => _BookCardState();
}

class _BookCardState extends State<BookCard> {
  bool hovered = false;

  @override
  Widget build(BuildContext context) => MouseRegion(
        onEnter: (_) => setState(() => hovered = true),
        onExit: (_) => setState(() => hovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          transform: hovered
              ? (Matrix4.identity()..translateByDouble(0.0, -2.0, 0.0, 1.0))
              : Matrix4.identity(),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: hovered ? const Color(0xFFBFD5EC) : Theme.of(context).dividerColor),
            boxShadow: hovered ? const [BoxShadow(color: Color(0x140F172A), blurRadius: 18, offset: Offset(0, 8))] : const [],
          ),
          child: InkWell(
            onTap: widget.onOpen,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  BookCover(title: widget.book.title),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.book.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text('${widget.book.author} · 共 ${widget.book.chapters} 章', maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: _muted)),
                        const SizedBox(height: 5),
                        Text('已读：${widget.book.progress}', maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: _muted)),
                        const Spacer(),
                        Align(alignment: Alignment.bottomLeft, child: TextButton.icon(onPressed: widget.onDelete, icon: const Icon(Icons.delete_outline, size: 17), label: const Text('删除'))),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class BookCover extends StatelessWidget {
  const BookCover({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) => Container(width: 80, height: 112, padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: const Color(0xFFD9B991), borderRadius: BorderRadius.circular(8)), child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [const Text('本地藏书', style: TextStyle(color: Color(0xFFFFFAF1), fontSize: 10)), const SizedBox(height: 8), Text(title, maxLines: 4, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFFFAF1), fontSize: 12, fontWeight: FontWeight.w600))]));
}

class ReaderPage extends StatefulWidget {
  const ReaderPage({super.key, required this.controller});
  final AppController controller;

  @override
  State<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  final ScrollController scrollController = ScrollController();
  bool loadingNext = false;
  int? renderedChapter;

  @override
  void initState() {
    super.initState();
    scrollController.addListener(_onScroll);
  }

  ReaderSettings get settings => widget.controller.settings;
  ReaderBook get book => widget.controller.reader!;
  bool get dark => settings.theme == 6;

  @override
  void dispose() {
    if (scrollController.hasClients) unawaited(widget.controller.saveProgress(scrollController.offset.round()));
    scrollController.removeListener(_onScroll);
    scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!settings.infiniteLoading ||
        loadingNext ||
        !scrollController.hasClients) {
      return;
    }
    if (scrollController.position.extentAfter > 360 ||
        book.current + 1 >= book.chapters.length) {
      return;
    }
    loadingNext = true;
    unawaited(widget.controller.loadChapter(book.current + 1).whenComplete(() {
      loadingNext = false;
      if (mounted && scrollController.hasClients) {
        scrollController.jumpTo(0);
      }
    }));
  }

  @override
  Widget build(BuildContext context) {
    final background = dark ? const Color(0xFF202020) : settings.theme == 4 ? const Color(0xFFF5E4E4) : const Color(0xFFEDE7DA);
    final foreground = dark ? const Color(0xFFE2E2E2) : const Color(0xFF262626);
    if (renderedChapter != book.current) {
      renderedChapter = book.current;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !scrollController.hasClients) {
          return;
        }
        scrollController.jumpTo(book.position.toDouble().clamp(0, scrollController.position.maxScrollExtent).toDouble());
      });
    }
    final contentStyle = TextStyle(
      fontFamily: _fontFamily(settings.font),
      fontSize: settings.fontSize.toDouble(),
      color: foreground,
      height: 1 + settings.lineSpacing,
      letterSpacing: settings.letterSpacing,
    );
    final contentSpans = <InlineSpan>[];
    final paragraphs = book.content.split(RegExp(r'\n{2,}'));
    for (var index = 0; index < paragraphs.length; index++) {
      contentSpans.add(TextSpan(text: paragraphs[index].trim(), style: contentStyle));
      if (index < paragraphs.length - 1) {
        contentSpans.add(TextSpan(text: '\n\n', style: contentStyle.copyWith(height: 1 + settings.paragraphSpacing)));
      }
    }

    return Scaffold(
      backgroundColor: background,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final horizontalPadding = (constraints.maxWidth * .08).clamp(20.0, 65.0).toDouble();
          return Row(
            children: [
              ReaderRail(
                dark: dark,
                onCatalog: () => _catalog(context),
                onSettings: () => _settings(context),
                onFilters: () => _filters(context),
                onShelf: widget.controller.closeReader,
                onTop: () => scrollController.animateTo(0, duration: Duration(milliseconds: settings.jumpDuration.clamp(0, 10000).round()), curve: Curves.easeOutCubic),
                onBottom: () => scrollController.animateTo(scrollController.position.maxScrollExtent, duration: Duration(milliseconds: settings.jumpDuration.clamp(0, 10000).round()), curve: Curves.easeOutCubic),
              ),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: settings.readWidth.toDouble()),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: background,
                        border: Border(
                          left: BorderSide(color: dark ? const Color(0xFF444444) : const Color(0xFFD8D8D8)),
                          right: BorderSide(color: dark ? const Color(0xFF444444) : const Color(0xFFD8D8D8)),
                        ),
                      ),
                      child: SingleChildScrollView(
                        controller: scrollController,
                        padding: EdgeInsets.fromLTRB(horizontalPadding, 64, horizontalPadding, 64),
                        child: SelectableText.rich(
                          TextSpan(
                            children: [
                              TextSpan(text: '${book.chapterTitle}\n', style: TextStyle(fontFamily: _fontFamily(settings.font), fontSize: settings.fontSize + 6, color: foreground, height: 1.35, fontWeight: FontWeight.w500)),
                              TextSpan(text: '${book.author}\n\n', style: TextStyle(fontFamily: _fontFamily(settings.font), fontSize: 12, color: dark ? const Color(0xFFAAAAAA) : const Color(0xFF8B7D72), height: 1.8)),
                              ...contentSpans,
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              ReaderChapterRail(dark: dark, onPrevious: book.current > 0 ? () => widget.controller.loadChapter(book.current - 1) : null, onNext: book.current + 1 < book.chapters.length ? () => widget.controller.loadChapter(book.current + 1) : null),
            ],
          );
        },
      ),
    );
  }

  String? _fontFamily(int index) => switch (index) {
        0 => 'SimSun',
        1 => 'SimHei',
        2 => 'KaiTi',
        4 => 'Microsoft YaHei',
        _ => null,
      };

  Future<void> _catalog(BuildContext context) async {
    await showGeneralDialog<void>(
      context: context,
      barrierLabel: '目录',
      barrierDismissible: true,
      barrierColor: Colors.black.withValues(alpha: .18),
      transitionDuration: const Duration(milliseconds: 240),
      pageBuilder: (context, _, __) => Align(
        alignment: Alignment.centerLeft,
        child: Material(
          child: SizedBox(
            width: 340,
            height: double.infinity,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 18, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('目录', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: _accent)),
                  const SizedBox(height: 16),
                  Expanded(
                    child: ListView.separated(
                      itemCount: book.chapters.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(book.chapters[index].title, maxLines: 1, overflow: TextOverflow.ellipsis),
                        selected: book.chapters[index].index == book.current,
                        onTap: () {
                          Navigator.pop(context);
                          widget.controller.loadChapter(book.chapters[index].index);
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _settings(BuildContext context) async {
    final value = await showDialog<ReaderSettings>(context: context, builder: (context) => SettingsDialog(settings: settings));
    if (value != null) await widget.controller.saveSettings(value);
  }

  Future<void> _filters(BuildContext context) async {
    await showDialog<void>(context: context, builder: (context) => FiltersDialog(book: book, onAdd: widget.controller.addFilter, onDelete: widget.controller.deleteFilter));
  }
}

class ReaderRail extends StatelessWidget {
  const ReaderRail({super.key, required this.dark, required this.onCatalog, required this.onSettings, required this.onFilters, required this.onShelf, required this.onTop, required this.onBottom});
  final bool dark;
  final VoidCallback onCatalog, onSettings, onFilters, onShelf, onTop, onBottom;

  @override
  Widget build(BuildContext context) => SizedBox(width: 62, child: Column(children: [_railButton(context, Icons.menu_book_outlined, '目录', onCatalog), _railButton(context, Icons.tune_rounded, '设置', onSettings), _railButton(context, Icons.filter_alt_outlined, '过滤', onFilters), _railButton(context, Icons.library_books_outlined, '书架', onShelf), const Spacer(), _railButton(context, Icons.vertical_align_top, '顶部', onTop), _railButton(context, Icons.vertical_align_bottom, '底部', onBottom)]));

  Widget _railButton(BuildContext context, IconData icon, String label, VoidCallback action) => Semantics(button: true, label: label, child: Tooltip(message: label, child: InkWell(onTap: action, child: Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Column(children: [Icon(icon, size: 18, color: dark ? Colors.white70 : _ink), const SizedBox(height: 3), Text(label, style: TextStyle(fontSize: 10, color: dark ? Colors.white70 : _muted))])))));
}

class ReaderChapterRail extends StatelessWidget {
  const ReaderChapterRail({super.key, required this.dark, required this.onPrevious, required this.onNext});
  final bool dark;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) => SizedBox(width: 48, child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [_chapterButton(context, Icons.chevron_left_rounded, '上一章', onPrevious), _chapterButton(context, Icons.chevron_right_rounded, '下一章', onNext), const SizedBox(height: 16)]));

  Widget _chapterButton(BuildContext context, IconData icon, String label, VoidCallback? action) => Semantics(button: true, label: label, child: Tooltip(message: label, child: IconButton(onPressed: action, icon: Icon(icon, color: action == null ? (dark ? Colors.white24 : Colors.black26) : (dark ? Colors.white70 : _ink)))));
}

class SettingsDialog extends StatefulWidget {
  const SettingsDialog({super.key, required this.settings});
  final ReaderSettings settings;

  @override
  State<SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends State<SettingsDialog> {
  late ReaderSettings value = widget.settings;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('阅读设置'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('阅读主题', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                children: List.generate(
                  7,
                  (index) => InkWell(
                    onTap: () => setState(() => value = value.copyWith(theme: index)),
                    borderRadius: BorderRadius.circular(18),
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: _themeColor(index),
                        shape: BoxShape.circle,
                        border: Border.all(color: value.theme == index ? _accent : Colors.black26, width: value.theme == index ? 3 : 1),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<int>(
                initialValue: value.font,
                decoration: const InputDecoration(labelText: '正文字体'),
                items: const [
                  DropdownMenuItem(value: 0, child: Text('宋体')),
                  DropdownMenuItem(value: 1, child: Text('黑体')),
                  DropdownMenuItem(value: 2, child: Text('楷体')),
                  DropdownMenuItem(value: 4, child: Text('微软雅黑')),
                ],
                onChanged: (font) => setState(() => value = value.copyWith(font: font)),
              ),
              const SizedBox(height: 14),
              _slider('字体大小', value.fontSize.toDouble(), 12, 48, (v) => value = value.copyWith(fontSize: v.round())),
              _slider('阅读宽度', value.readWidth.toDouble(), 620, 1100, (v) => value = value.copyWith(readWidth: v.round())),
              _slider('字距', value.letterSpacing, 0, 2, (v) => value = value.copyWith(letterSpacing: v)),
              _slider('行距', value.lineSpacing, .2, 2, (v) => value = value.copyWith(lineSpacing: v)),
              _slider('段距', value.paragraphSpacing, 0, 4, (v) => value = value.copyWith(paragraphSpacing: v)),
              _slider('翻页速度', value.jumpDuration.toDouble(), 0, 10000, (v) => value = value.copyWith(jumpDuration: v.round())),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('无限加载'),
                subtitle: const Text('阅读接近末尾时预加载下一章'),
                value: value.infiniteLoading,
                onChanged: (enabled) => setState(() => value = value.copyWith(infiniteLoading: enabled)),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
        FilledButton(onPressed: () => Navigator.pop(context, value), child: const Text('保存')),
      ],
    );
  }

  Widget _slider(String label, double current, double min, double max, ValueChanged<double> onChanged) => StatefulBuilder(builder: (context, setLocal) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Text(label), const Spacer(), Text(current.toStringAsFixed(label == '字体大小' || label == '阅读宽度' ? 0 : 1), style: const TextStyle(color: _muted))]), Slider(value: current.clamp(min, max), min: min, max: max, onChanged: (v) { onChanged(v); setLocal(() {}); setState(() {}); })]));

  Color _themeColor(int index) => const [Color(0xFFFAF5EB), Color(0xFFF5EACC), Color(0xFFE6F2E6), Color(0xFFE4F1F5), Color(0xFFF5E4E4), Color(0xFFE0E0E0), Color(0xFF222222)][index];
}

class FiltersDialog extends StatefulWidget {
  const FiltersDialog({super.key, required this.book, required this.onAdd, required this.onDelete});
  final ReaderBook book;
  final Future<ReaderBook?> Function(String search, String replacement) onAdd;
  final Future<ReaderBook?> Function(int id) onDelete;

  @override
  State<FiltersDialog> createState() => _FiltersDialogState();
}

class _FiltersDialogState extends State<FiltersDialog> {
  final search = TextEditingController();
  final replacement = TextEditingController();
  late List<FilterRule> rules = List<FilterRule>.of(widget.book.filters);

  @override
  void dispose() {
    search.dispose();
    replacement.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('内容过滤'),
      content: SizedBox(
        width: 500,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: search, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: '过滤内容')),
              const SizedBox(height: 12),
              TextField(controller: replacement, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: '替换内容', helperText: '留空表示直接删除')),
              const SizedBox(height: 18),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  onPressed: () async {
                    final updated = await widget.onAdd(search.text, replacement.text);
                    if (mounted) {
                      setState(() {
                        if (updated != null) rules = updated.filters;
                        search.clear();
                        replacement.clear();
                      });
                    }
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('添加规则'),
                ),
              ),
              const Divider(height: 28),
              Text('已有规则', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (rules.isEmpty)
                const Text('暂无过滤规则', style: TextStyle(color: _muted))
              else
                ...rules.map(
                  (rule) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('过滤：${rule.search}'),
                    subtitle: Text('替换：${rule.replacement.isEmpty ? '删除' : rule.replacement}'),
                    trailing: IconButton(
                      tooltip: '删除规则',
                      onPressed: () async {
                        final updated = await widget.onDelete(rule.id);
                        if (mounted && updated != null) {
                          setState(() => rules = updated.filters);
                        }
                      },
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭'))],
    );
  }
}
