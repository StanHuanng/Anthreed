"""Create a small original, public demo book; no third-party book content."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
from html import escape

ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = [
    ('把时间留给阅读', [
        '我们每天读很多文字，却不一定记得自己读过什么。消息向前滚动，新的标题替代旧的标题。偶尔停下来，才发现真正想读的那一篇，还安静地躺在某个角落。',
        '阅读可以从一个很小的动作开始：关掉一条通知，把手机调暗一点，或者给自己留出一杯茶的时间。不必把一本书读完，只需要把眼前这一段读进去。',
        '这本小书是 Anthreed 的原创演示内容。它没有宏大的结论，只想陪你试一试：把文字放到设备里，翻到下一章，再回到刚才读过的位置。',
        '窗外的声音会继续，日程也会继续。读书不是逃离生活，而是给生活增加一种速度。我们可以很快地处理事务，也可以很慢地理解一句话。',
        '当一段文字让你停顿，不妨把它留下来。有时我们保存的不是作者的答案，而是自己的那个问题。下一次重读，问题也许已经长出了新的样子。',
        '今天的阅读，到这里也很好。你不必证明自己足够勤奋，不必把每一次翻页变成一个数字。只要这一小段时间，确实属于你。',
    ]),
    ('在信息之间留白', [
        '同一件事，可能同时出现在好几个地方。不同的标题制造出不同的紧迫感，但我们真正需要的，往往只是一篇讲清楚来龙去脉的文章。',
        '留白不是少知道一些，而是给理解腾出地方。读完一个判断，可以再问一句：它依据什么？这句话里，哪些是事实，哪些是解释？',
        '把来源留在文字旁边，是一种朴素的尊重。好的阅读不止接收结论，也愿意沿着线索回到原处，看见写作者站立的位置。',
        '整理书架也是同样的事情。我们把想读的书放在一起，不是为了把它们尽快消耗完，而是让下一次打开时，有一条清楚的路可以走。',
        '如果今天只读了一篇，却终于想明白一件事，这一天的阅读已经足够充实。少一点重复，思考就多一点空间。',
        '下一章不会催你。你随时可以合上这本书，下一次再回来。页面替你记住位置，而你可以把注意力交还给正在发生的生活。',
    ]),
    ('与一句话再相遇', [
        '摘录像在路边放下一枚小石子。它不能替你走完旅程，却能提醒未来的自己：你曾经在这里认真停留过。',
        '有的句子第一次读很平常，隔了一段时间，却突然变得贴切。文字没有改变，改变的是我们带到文字面前的经验。',
        '所以，不必急着整理出完美的知识体系。可以先留下一个片段，一点困惑，一句还没有写完的批注。理解经常发生在重新打开之后。',
        '当你愿意回到原文，摘录就不再只是一个孤立的句子。它重新拥有上下文，拥有作者的语气，也拥有你当时阅读的那一点心情。',
        '一本书结束了，阅读却没有结束。它会在一次对话里、一段路程中，或者另一本书的某一页上，再次出现。',
        '愿你每次打开阅读空间，都能找到一点从容。读完最后一页，也记得抬起头，看看窗外。',
    ]),
]

def create():
    target = ROOT / 'web/public/demo.epub'
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'w', compression=ZIP_DEFLATED) as book:
        book.writestr('mimetype', 'application/epub+zip', compress_type=ZIP_STORED)
        book.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        manifest = ''.join(f'<item id="c{i}" href="chapter{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(len(CHAPTERS)))
        spine = ''.join(f'<itemref idref="c{i}"/>' for i in range(len(CHAPTERS)))
        book.writestr('OEBPS/content.opf', f'<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">anthropo-original-demo-v1</dc:identifier><dc:title>阅读的间隙</dc:title><dc:creator>Anthreed · 原创示例</dc:creator><dc:language>zh-CN</dc:language><meta property="dcterms:modified">2026-10-18T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>{manifest}</manifest><spine>{spine}</spine></package>')
        for i, (title, paragraphs) in enumerate(CHAPTERS):
            body = ''.join(f'<p>{escape(p)}</p>' for p in paragraphs)
            book.writestr(f'OEBPS/chapter{i}.xhtml', f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN"><head><title>{title}</title></head><body><h1>{title}</h1>{body}</body></html>')
        links = ''.join(f'<li><a href="chapter{i}.xhtml">{title}</a></li>' for i, (title, _) in enumerate(CHAPTERS))
        book.writestr('OEBPS/nav.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>{links}</ol></nav></body></html>')
    print(f'Created original demo EPUB: {target}')

if __name__ == '__main__':
    create()
