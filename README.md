# hsoj-anti-cheat
hsoj-anti-cheat 插件是适用于HSOJ或HydroOJ的反作弊插件。

### 使用方法

安装成功后，OJ系统管理员可在系统面板中设置反作弊模式。

启用反作弊模式后，用户参加进行中的比赛时，不能打开非比赛的题目详情，讨论详情，私信以及查看比赛开始前的作答记录。比赛结束后，用户会不受反作弊模式的影响。

由于反作弊模式是基于用户参加的单场比赛设计的，如果存在多场同时进行的比赛时，用户在一般情况下可以同时参加多场比赛，导致反作弊模式生效的比赛是其最新参加的一轮比赛，可能导致无法作答之前参加比赛的题目或者可以提前退出反作弊模式。因此插件提供了禁止用户同时参加多场比赛的开关。开关开启后，用户只能参加一场比赛，直到该比赛结束才能参加另一场比赛。所以，**务必提示用户看清楚要参加的比赛名称才参与，防止不必要的麻烦**。

如果用户有参加了其他比赛而不能参加本比赛的情况，管理员可以在插件重置用户的生效比赛。根据用户的用户名，输入生效比赛的域（留空为system默认域）和比赛的tid（可以在比赛的url中获取tid参数，留空则用户可以自由参加任意一场比赛）进行重置。

无论反作弊模式是否开启，系统会记录下应生效的比赛，比赛中途开启反作弊模式后续有效，无需其他设置。

### 安装方法
输入命令
```bash
yarn global add https://github.com/hstc-acm/hsoj-anti-cheat.git
hydrooj addon add hsoj-anti-cheat
pm2 restart hydrooj
# 优先这个方法
```
或者
```bash
git clone https://github.com/hstc-acm/hsoj-anti-cheat.git /root/.hydro/addon
hydrooj addon add /root/.hydro/addon/hsoj-anti-cheat
pm2 restart hydrooj
```


