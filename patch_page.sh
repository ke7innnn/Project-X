sed -i '' 's/if (data\[idx\] > 50 || data\[idx+1\] > 50 || data\[idx+2\] > 50)/if (data[idx] > 120 || data[idx+1] > 120 || data[idx+2] > 120)/' app/smart-planner/page.tsx
sed -i '' 's/const scale = Math.min(scaleW, scaleH) \* 0.70;/const scale = Math.min(scaleW, scaleH) * 0.75;/' app/smart-planner/page.tsx
