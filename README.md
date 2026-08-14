# apricitea.github.io

Personal site — [apricitea.github.io](https://apricitea.github.io/)

Single-page portfolio (about, current focus, recent builds, contact) plus a
side page, `realm.html`, for hobby/off-topic notes. Static HTML/CSS/JS, no
build step — dark theme with a light/dark toggle.

## Structure

```
index.html          # main site
realm.html           # "the hobby corner" side page
assets/
  js/portal.js        # theme toggle + portal transition effect
  img/realm/           # imagery for realm.html
favicon.svg
```

## Local dev

Just open `index.html` in a browser, or serve the directory:

```bash
python -m http.server 8000
```
