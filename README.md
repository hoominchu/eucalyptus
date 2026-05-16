# eucalyptus

Notion Worker prototype for detecting Luma-related mail received through a Notion Custom Agent Mail trigger.

The first milestone is intentionally small: when the Custom Agent receives a Luma email, it calls the `logLumaEmailHello` Worker tool and the Worker logs `hello world`.

See [docs/notion-luma-mail-trigger.md](docs/notion-luma-mail-trigger.md) for the Notion setup flow.
