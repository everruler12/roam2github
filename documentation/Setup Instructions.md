# Setup Instructions

1. Create a new, private repository
2. Go to Settings > Secrets and add the following Secret names and values:
    - `ROAM_EMAIL` - Your Roam account email
    - `ROAM_PASSWORD` - Your Roam account password (needs to be reset if using a Google login)
    - `ROAM_GRAPH` - The name of the graph to backup. For multiple graphs, add on separate lines (or separate by commas)
3. Go to Actions, then click "set up a workflow yourself →"
4. Delete the code in the editor, and copy/paste the code from here: [main.yml](https://raw.githubusercontent.com/everruler12/roam2github-actions/main/.github/workflows/main.yml)
5. Click `Start Commit` then `Commit new file`

The backup will run every hour. You can view the logs in Actions and clicking on the jobs.
