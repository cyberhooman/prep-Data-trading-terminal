from pathlib import Path
path = Path(''index.js'')
text = path.read_text(encoding=''utf-8'')
start = text.find("app.get('/next',")
if start != -1:
    brace = 0
    i = start
    while i < len(text):
        if text[i] == '{':
            brace += 1
        elif text[i] == '}':
            brace -= 1
            if brace == 0:
                # move past closing brace and following );
                j = text.find('\n', i)
                if j == -1:
                    j = len(text)
                else:
                    j += 1
                text = text[:start] + text[j:]
                break
        i += 1
path.write_text(text, encoding='utf-8')
