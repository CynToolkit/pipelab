# System actions

The System plugin registers a **Manual** event trigger and four actions:

| Node | Input | Output / behavior |
|---|---|---|
| **Manual** | None | Starts a pipeline manually; no outputs |
| **Log** | Required `message` string (default empty) | Writes to the execution log; no outputs |
| **Alert** | Required `message` string (default empty) | Interactive mode returns `answer`; headless mode logs the alert and returns `ok` |
| **Prompt** | Required `message` string (default empty) | Returns the text entered as `answer` |
| **Wait** | Required `duration` in milliseconds; default `2000` | Pauses execution; no outputs |

Prompt requires an interactive UI and fails in headless mode with an explicit error. Alert uses a dialog when a UI window is available; if dialog IPC fails, the task fails. In headless mode it only logs the message and returns `ok`, so it does not wait for user acknowledgement. There are no credentials or declared platform targets. Join is not listed because it is not registered by the plugin.

## Minimal example

```text
Log.message: Export started
Wait.duration: 2000
```

Connect these actions in a pipeline to log a message and wait two seconds. The manual event itself takes no parameters.
