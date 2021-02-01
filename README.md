# Roam2Github

Inspired by https://github.com/MatthieuBizien/roam-to-git

roam-to-git has offered great peace mind knowing my Roam data is safe. However, backups regularly failed with unknown errors multiple times a week. Then it got to the point where all my backups were failing. The creator is not very active with support, and I don't know enough Python to fork and make pull requests. So I decided to roll my own backup solution using Node, with clearer logging to make troubleshooting easier.

### Differences

- Uses Node (rather than Python)
- Supports EDN! And JSON (No Markdown support yet, as it has been causing too many errors and timeouts)
- Better error debugging
- Active support from the developer (Erik Newhard @everruler12) to get your backups running smoothly and error-free

### Instructions

Assuming you're coming from roam-to-git and have followed my [guide](https://eriknewhard.com/blog/backup-roam-in-github), you can find simple instructions on how to update your Secrets and main.yml here:

https://github.com/everruler12/roam2github-demo

### Future Plans

- [ ] New, full guide for non-roam-to-git users
- [ ] Multiple graph backups in same repo
- [ ] Markdown support
- [ ] Any other features you want?
- [x] EDN support

### EDN Backups are live!

The backup has a check to make sure the formatted EDN (which only adds extra linebreaks and indentation) can be parsed back to match exactly with the original before saving it. It will exit with an error if it can't, so you can rest assured that the formatting doesn't mess with the file integrity. I also tested that the formatted EDN can be used to successfully restore graphs.

2021-01-31 It took all day to figure out how to use ClojureScript to prettify EDN. It was a daunting task, never having dealt with Clojure before, much less compiling it into JavaScript. But I did it! This is necessary because the exported EDN data from Roam is all in one line, meaning GitHub would have to save the entire file each time, instead of just the new lines. This would eat up the storage pretty quickly if run every hour, as unchanged notes would be duplicated each time. And you wouldn't be able to see line-by-line changes in the git history.

### Support / Donations

**If you experience any issues or errors with my backup script, let me know!** Either post as a GitHub issue here, or send me a message at my support email:

[erik@eriknewhard.com](mailto:erik@eriknewhard.com)

---

Some very generous people have been asking how to donate. If you like my work, I won't refuse your support!

Email for PayPal and Amazon gift cards: [erik.newhard@gmail.com](erik.newhard@gmail.com)

Bitcoin (BTC) address: `bc1qsa3l8lraa3rjj6wyc7zdlv5z2xnlunppavtxw0`
