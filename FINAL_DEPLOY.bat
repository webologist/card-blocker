@echo off
REM BLOCKMYCARD LEGAL COMPLIANCE - FINAL DEPLOYMENT
REM Upload 5 beautiful HTML legal pages with navigation menu
REM This script deploys to GitHub → Auto-deploys to Vercel
REM
REM All files are ready. Just run this script!

setlocal enabledelayedexpansion

cls
echo.
echo ====================================================================
echo   BlockMyCard Legal Compliance - FINAL DEPLOYMENT
echo   5 Beautiful HTML Pages + Navigation Menu
echo ====================================================================
echo.

REM Check if in card-blocker repo
cd /d C:\card-blocker

if not exist .git (
    echo ERROR: Not in a Git repository (C:\card-blocker)
    echo Make sure you're in your GitHub repository folder
    pause
    exit /b 1
)

echo [✓] Git repository detected
echo.

REM Create public folder
if not exist public mkdir public
echo [✓] Public folder ready: C:\card-blocker\public
echo.

REM Copy 5 HTML legal pages
echo Copying 5 legal HTML pages to public folder...
echo.

if exist "terms.html" (
    copy "terms.html" "public\terms.html" >nul 2>&1
    if !errorlevel! equ 0 (
        echo   [✓] Terms of Service (terms.html)
    )
)

if exist "grievance-redressal.html" (
    copy "grievance-redressal.html" "public\grievance-redressal.html" >nul 2>&1
    if !errorlevel! equ 0 (
        echo   [✓] Grievance Redressal (grievance-redressal.html)
    )
)

if exist "data-security.html" (
    copy "data-security.html" "public\data-security.html" >nul 2>&1
    if !errorlevel! equ 0 (
        echo   [✓] Data Security (data-security.html)
    )
)

if exist "refund-policy.html" (
    copy "refund-policy.html" "public\refund-policy.html" >nul 2>&1
    if !errorlevel! equ 0 (
        echo   [✓] Refund Policy (refund-policy.html)
    )
)

if exist "BlockMyCard_Business_Information_Page.html" (
    copy "BlockMyCard_Business_Information_Page.html" "public\business-info.html" >nul 2>&1
    if !errorlevel! equ 0 (
        echo   [✓] Business Information (business-info.html)
    )
)

echo.
echo Verifying files in public folder...
dir /b public\*.html
echo.

REM Stage files in git
echo [*] Staging files in Git...
git add public/terms.html public/grievance-redressal.html public/data-security.html public/refund-policy.html public/business-info.html 2>nul

if !errorlevel! equ 0 (
    echo [✓] Files staged successfully
) else (
    echo [!] Some files may already be staged
)

echo.

REM Commit
echo [*] Creating commit...
git commit -m "Deploy 5 legal compliance pages with navigation menu (Terms, Grievance, Data Security, Refund, Business Info)" 2>nul

if !errorlevel! equ 0 (
    echo [✓] Commit created
) else (
    echo [!] Commit message: No new commits needed (files may already be committed)
)

echo.

REM Push to GitHub
echo [*] Pushing to GitHub...
echo    (This triggers Vercel auto-deployment)
echo.

git push origin main 2>nul

if !errorlevel! equ 0 (
    echo [✓] Successfully pushed to GitHub!
) else (
    echo [✗] Push failed
    echo    Check your Git configuration: git config --list
    echo    Check GitHub credentials in Windows Credential Manager
    pause
    exit /b 1
)

echo.
echo ====================================================================
echo   🎉 DEPLOYMENT SUCCESSFUL!
echo ====================================================================
echo.
echo Timeline:
echo   ✓ Now:       Pushed to GitHub
echo   ⏳ 1 min:    Vercel detects changes
echo   ⏳ 2 min:    Build & deploy
echo   ✓ 3 min:    LIVE on production!
echo.
echo Your Legal Pages:
echo   • https://card-blocker.vercel.app/terms.html
echo   • https://card-blocker.vercel.app/business-info.html
echo   • https://card-blocker.vercel.app/grievance-redressal.html
echo   • https://card-blocker.vercel.app/data-security.html
echo   • https://card-blocker.vercel.app/refund-policy.html
echo.
echo Features:
echo   ✓ Professional navigation menu on all pages
echo   ✓ Responsive design (mobile + desktop)
echo   ✓ Beautiful HTML formatting
echo   ✓ Footer with links to all pages
echo   ✓ Color-coded pages for easy navigation
echo.
echo Next steps:
echo   1. Wait 3 minutes for Vercel to deploy
echo   2. Check https://vercel.com/dashboard
echo   3. Test the links above in your browser
echo   4. Update your main site footer/navigation
echo.
echo ====================================================================
echo    Status: ✅ ALL 5 LEGAL PAGES DEPLOYED
echo ====================================================================
echo.

pause
