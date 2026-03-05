# gouse-vsc

Toggle ‘declared and not used’ errors in Go by using idiomatic `_ = notUsedVar`
and leaving a TODO comment.
![a demo gif](https://raw.githubusercontent.com/looshch/gouse/master/demo.gif)

### Quick fix

![quick fix demo](https://raw.githubusercontent.com/vipkek/gouse-vsc/refs/heads/master/assets/quick-fix-demo.png)

### One-Click Install

![one-click install demo](https://raw.githubusercontent.com/vipkek/gouse-vsc/refs/heads/master/assets/one-click-install-demo.png)

### Context Menu

![context menu demo](https://raw.githubusercontent.com/vipkek/gouse-vsc/refs/heads/master/assets/context-menu-demo.png)

### Source Action

![source action demo](https://raw.githubusercontent.com/vipkek/gouse-vsc/refs/heads/master/assets/source-action-demo.png)

Available on
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=looshch.gouse)
and [Open VSX Registry](https://open-vsx.org/extension/looshch/gouse).

## Dependencies

[`gouse`](https://github.com/looshch/gouse) is required.

```
go install github.com/looshch/gouse/v2@latest
```

## Usage

“gouse: Toggle ‘declared and not used’ errors” command toggles the errors in a
file.

The extension adds a light-bulb quick fix that runs `gouse` for the current
file.

You can also run the same fix from the editor right-click context menu or from
the editor Source Action menu as `source.fixAll.gouse`.

If `gouse` is missing, the extension can offer a one-click install. That still
requires the Go toolchain to be available on your `PATH`.

If `gouse` is installed somewhere non-standard, set `gouse.path` in VS Code to
point to the executable.

By default, if `gouse.path` is empty and `gouse` is already installed, the
extension also tries to update `gouse` to the latest version in the background
on startup. You can disable this with `gouse.autoUpdateOnStartup`.
