# Common error causes

- `R2G ERROR - Secrets error: R2G_EMAIL not found` (or `R2G_PASSWORD` or `R2G_GRAPH`)

    One of those secrets is blank or missing. Add it in Settings > Secrets
    
- `R2G ERROR - Login error. Roam says: "There is no user record corresponding to this identifier. The user may have been deleted."` or `R2G ERROR - Login error. Roam says: "The email address is badly formatted."`

    Your `R2G_EMAIL` secret is incorrect. Try updating it.
    
- `R2G ERROR - Login error. Roam says: "The password is invalid or the user does not have a password."`

    Your `R2G_PASSWORD` secret is incorrect. Try updating it.
    
    Make sure you're not using a Google account login, as this is not supported. (If you are, sign out of Roam, and on the sign-in page, click "Forgot your password" to set a password.)
    
- Timed out with `R2G astrolabe spinning...` then `Error: The operation was canceled.` Possible causes:

    - The most common reason is your `R2G_GRAPH` secret is incorrect. Try updating it (make sure it's only the graph name, not a URL)

    - Roam's servers happened to timeout. Try re-running the job later.
    
    - You don't have permission to view that graph (in case of trying to backup up someone else's graph).
    
    - You graph is too large to be loaded within the backup timeout (default set to 10 minutes). This is highly unlikely, as it shouldn't take 10 minutes to load. (If you still think this is the case, you could try increasing the timeout in main.yml and adding the `TIMEOUT` env setting as explained here: [Extra Options](https://github.com/everruler12/roam2github#extra-options))

- `R2G ERROR - EDN formatting error: mismatch with original`

    The file integrity check to make sure the formatted version of the EDN file matches the downloaded EDN export failed. Please let me know if this were ever to happen.
