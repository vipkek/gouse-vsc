# gouse-vsc

Toggle ‘declared and not used’ errors in Go by using idiomatic `_ = notUsedVar`
and leaving a TODO comment.
![a demo gif](https://raw.githubusercontent.com/looshch/gouse/master/demo.gif)

Available on
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=looshch.gouse)
and [Open VSX Registry](https://open-vsx.org/extension/looshch/gouse).

## Dependencies

[`gouse`](https://github.com/looshch/gouse) is required.

```
go install github.com/looshch/gouse@latest
```

<!-- prettier-ignore -->
> [!CAUTION]
>
> Archived Go versions require older `gouse` version.
>
> | Go version   | gouse version |
> | -------------|---------------|
> | 1.21.0+      | 1.3.0+        |
> | 1.18–1.20.14 | 1.2.3         |

## Usage

“gouse: Toggle ‘declared and not used’ errors” command toggles the errors in a
file.
