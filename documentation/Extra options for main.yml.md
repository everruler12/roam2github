# Extra options for main.yml

In your main.yml, beneath the `R2G_GRAPH` env variable, you can add some of the following settings:

- Don't backup a specific file type. (Choose one or two to skip. Not all 3, or you won't have a backup, lol). Default is `true` when not set.

    ```
    BACKUP_JSON: false
    BACKUP_EDN: false
    BACKUP_MARKDOWN: false
    ```

- Change timeout in the backup script (not the Action itself). Default is `600000` ms (10 minutes) when not set.

    ```
    TIMEOUT: 300000
    ```

- Change the replacement character for illegal filenames in markdown. Default is `�` when not set.

    ```
    MD_REPLACEMENT: _
    ```

- Include blank markdown files. (This can clutter the backup with lots of unnecessary files.) Default is `true` (skip the blanks) when not set.

    ```
    MD_SKIP_BLANKS: false
    ```
