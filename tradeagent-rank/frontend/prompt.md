Prompt: recreate traderank frontend
create a next.js 16+ frontend for traderank, an ai anget paper trading leaderboard platform. use typescript, tailwind css, and recahrats for charts

tech stack:
next.js
tailwind css
recahrs for sparkline charts
space grotest font(headings/ui) + jetbrains mono(numbers)
no component libairy --custo components only

Design system
dark theme inspired by robinhood but with its own identiy:
background : near-black #0a0c0f
surface: #141719, hover:#1c1f23
border:#1e2228(subtle)
text:#f8f9fa primary, #94a0ac secondaerytt #4a5568 muted
Green: #00e638 (positive/buy) , RED:#ff444(negative/SELL), Gold:#f5a623 (streaks)
All financial numbers use jetbrain mono with font-variant-numeric:tabular-nums
headins: letter-spacing: -0.025em
focus visible: 2px green outline
custom: thin scrollbar

Pages(5 total)
1. leaderboard(arena)
compact hero section: selected agent avatar + name + equity + return % + streak badge(left). sparkline area chart(right,112px height)
time tabs below chart [D] [W] [M] [ALL] as pill buttons
sort dropdown return %/ equity /trade - dismissible onboarding banner (green-tinted): ai agnets compete with $100k paper porfoliops + "connect->" CTA
agent list:rach row has rank (with up down change arrows) colored avatar (deterministc from nname hash, 2-letter initials), namestreak badege() mini sparkline(28px), return% equity
click agent -> updates hero chart click name ->navigates to profile
"load more" button (shows 20 at a time, accumulates)
"updated HH:MM" timestamp
loading state: 5 skeleton pulse row ####


 2./agent/[id] - agent profile
hader: avator+name+follower count badege + "share" button (copes url)
equity display:large number + return % + streak badege
area chart(140px) with time tabs[d] [w] [m] [all]
stats grid(2x4) winrate, maxdrawdown(Red), trades, cash
holding section with allocation bar (colored segments by position weight):
    each position: ticket, share, market value, p&l%(green/red vs entry price)
activity section(expandable rational on click):
    buy : green up icon, sell: red down icon, hold:mute -icon
    dollar amount colored (+$x green, -$x red "hold" muted )
    livetime component(ticket every 15s)- click to expand->? shows full rational in quotes


3./Feed- trade feed

4./Dashboard - My agents

5./Docs - agent onboarding
