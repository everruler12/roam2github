# Full Guide with Step-by-Step Screenshots

This guide was generously created by [flyq](https://github.com/flyq)

## 1. Create a new, private repository
1. If you don't have the GitHub account, go to https://github.com/join to new a free personal account. More infomation: [Signing up for a new GitHub account](https://docs.github.com/en/github/getting-started-with-github/signing-up-for-a-new-github-account)   
![](./images/Signing%20up%20for%20a%20new%20GitHub%20account.png)
2. Go to https://github.com/login, and sign in with your account:   
![](./images/login%20GitHub.png)
3. Click `New repository`:   
![](./images/Create%20New%20repository.png)
4. Create a new repository:   
![](./images/Create%20New%20private%20repository.png)   
The `repository name` is up to you, and you should make it private to protect your privacy.   
5. Congratulations on successfully creating a private repository:   
![](./images/private%20repository%20success.png)

## 2. Set the GitHub Repository's Secret
1. Get the email and password of your roam research account:   
![](./images/email%20and%20password.png)   
2. Get the name of graph you want to backup:   
![](./images/Get%20the%20graph%20name.png)   
3. Go to your GitHub repository, and go to `Settings` > `Secrets`, and `New repository secret`:   
![](./images/Go%20to%20Settings.png)   
4. Add `R2G_EMAIL` in Secret:   
![](./images/add%20R2G_EMAIL.png)   
As you see, Name must be `R2G_EMAIL`, and Value is the email of your roam research account.   
5. Add `R2G_PASSWORD` in Secret:   
![](./images/add%20R2G_PASSWORD.png)   
The same to step 4, New repository secret to add `R2G_PASSWORD`. As you see, Name must be `R2G_PASSWORD`, and Value is the password of your roam research account.   
6. Add `R2G_GRAPH` in Secret:   
![](./images/add%20R2G_GRAPH.png)   
The same to step 4, New repository secret to add `R2G_GRAPH`. As you see, Name must be `R2G_GRAPH`, and Value is the name of your roam research graph, which you get from step 2.  For multiple graphs, add on separate lines (or separate by commas), Here I used commas.   
## 3. Set the GitHub Repository's Actions
1. Go to Actions, then click "set up a workflow yourself →"   
![](./images/Set%20workfow.png)   
2. Delete the code in the editor, and copy/paste the code from here: [main.yml](https://raw.githubusercontent.com/everruler12/roam2github-demo/main/.github/workflows/main.yml)   
![](./images/add%20yml.png)   
3. Click `Start Commit` then `Commit new file`   
![](./images/add%20new%20file.png)   
## 4. Congratulations on successfully finish all of this
So far, you have successfully completed all steps.   
And Waiting a few minutes(I waited for 5 minutes here), the actions-user backup your roam research graph automatically:   
![](./images/success%20set%20up.png)
