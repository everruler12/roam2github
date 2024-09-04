# Roam2Github

⚠️
**I no longer maintain this project, since Roam has Auto Backups included natively (and I've stopped using Roam as my primary second brain).**
⚠️

---

[Click here to view guide on setting up free, unlimited, automatic Roam backups](https://www.notion.so/Roam2Github-Backup-Guide-650925859a4a42cf940e3fb74f5189f9)

[Click here for extra settings](https://github.com/everruler12/roam2github/blob/main/documentation/Settings%20for%20main.yml.md)

---

This project was inspired by https://github.com/MatthieuBizien/roam-to-git

Roam-to-git has offered me great peace of mind knowing my Roam data is safe. However, my backups regularly failed with unknown errors multiple times a week. People were emailing me with the same issues, and I couldn't help. Then it got to the point on 2021-01-28 where all my backups were failing. Roam-to-git's creator didn't seem active with addressing the issues, and I don't know enough Python fix his code. So I decided to write my own backup solution from scratch using Node— with clearer logging to make troubleshooting easier.

## Differences from roam-to-git

- Uses Node (rather than Python)
- Supports EDN in addition to JSON and Markdown (not formatted markdown though)
- Multiple graph backups in the same repo
- Better error debugging and active support from the developer (Erik Newhard @everruler12) to get your backups running smoothly and error-free

## ~~Future Plans~~

- [ ] ~~New, full guide with step-by-step screen recordings~~
- [ ] ~~Update code to run asynchronously, instead of linearly, to cut down on run time~~
- [ ] ~~Use fipp for faster EDN formatting~~

## Changelog

- EDN support (2021-01-31)
- Multi graph support (2021-02-01)
- Markdown support (2021-02-04)
- Allow setup of public repo for running Actions and committing to private repo for backup, in order to bypass minute limit for private GitHub Actions (2021-02-18)

### EDN Backups are live!

The backup has a check to make sure the formatted EDN (which only adds extra linebreaks and indentation) can be parsed back to match exactly with the original before saving it. It will exit with an error if it can't, so you can rest assured that the formatting doesn't mess with the file integrity. I also tested that the formatted EDN can be used to successfully restore graphs.

2021-01-31 It took all day to figure out how to use ClojureScript to prettify EDN. It was a daunting task, never having dealt with Clojure before, much less compiling it into JavaScript. But I did it! This is necessary because the exported EDN data from Roam is all in one line, meaning GitHub would have to save the entire file each time, instead of just the new lines. This would eat up the storage pretty quickly if run every hour, as unchanged notes would be duplicated each time. And you wouldn't be able to see line-by-line changes in the git history.

### Multi Graph Backups in Same Repo

You can now backup multiple graphs without having to create a new GitHub repo for each one. Just add them to your `R2G_GRAPH` Secret in separate lines, or separated by commas.

### Markdown support added

2021-02-04 Markdown is now supported. Worked all day to get filename sanitization working. My backup script can even export markdown from the [official Roam help database](https://roamresearch.com/#/app/help) and Roam [book](https://roamresearch.com/#/app/roam-book-club) [clubs](https://roamresearch.com/#/app/roam-book-club-2) error-free! I have added several measures to prevent errors:

- `/` slashes are replaced with full-width versions `／`
- illegal filename characters are replaced with `�`
- Page titles longer than 255 characters are automatically truncated (though they lose the .md extension)
- no subdirectories
- no blank files
- ~~The logs will list the files that have been renamed or overwritten.~~ The logs no longer display file names, as this would be a privacy concern for the new way to run Actions publicly. 

Unfortunate side-effect with markdown backups: files with duplicate names are overwritten (like [[test]] and [[Test]]). (This was also present in roam-to-git)

### Separate backup save location and backup script actions

It is possible now to run the script actions from a public repo, to not be limited by 2000 minutes/month, and save the backup to a private repo. Note that Secret names have changed with this update. (The guides at the top have been updated with the new Secret names and main.yml. The old version is still up, but will no longer be updated.)

## Support

[Common error causes and their solutions](https://github.com/everruler12/roam2github/blob/main/documentation/Common%20error%20causes.md)
