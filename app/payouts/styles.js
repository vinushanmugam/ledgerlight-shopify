// Shared look for the app: big readable text, strong contrast, and one colour per kind of message.
export const CSS = `
.ll { font-size: 18px; line-height: 1.5; color: #1a1a1a; max-width: 980px; margin: 0 auto; padding: 8px 0 40px; }
.ll * { box-sizing: border-box; }
.ll h2 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; }
.ll h3 { font-size: 21px; margin: 0 0 6px; }
.ll p { margin: 0 0 10px; }
.ll .ll-small { font-size: 16px; color: #3d3d3d; }

.ll .ll-note { display: flex; gap: 14px; align-items: flex-start; border-radius: 14px; padding: 18px 20px; margin: 0 0 18px; border: 2px solid; }
.ll .ll-note .ll-icon { flex: none; width: 34px; height: 34px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; }
.ll .ll-note h3 { margin: 0 0 2px; }
.ll .ll-note p { margin: 0; }
.ll .ll-info { background: #eaf3ff; border-color: #2f6fcb; } .ll .ll-info .ll-icon { background: #1d5fc4; }
.ll .ll-bad { background: #fdeceb; border-color: #c62828; } .ll .ll-bad .ll-icon { background: #b3261e; }
.ll .ll-warn { background: #fff5dd; border-color: #c27a00; } .ll .ll-warn .ll-icon { background: #a35f00; }
.ll .ll-good { background: #e6f6ea; border-color: #2e7d32; } .ll .ll-good .ll-icon { background: #2e7d32; }

.ll .ll-block { border-radius: 18px; padding: 26px 26px 22px; margin: 0 0 26px; border: 2px solid; }
.ll .ll-step1 { background: #eaf3ff; border-color: #2f6fcb; }
.ll .ll-step2 { background: #f4f0ff; border-color: #6b4fc7; }
.ll .ll-title { display: flex; align-items: center; gap: 14px; margin: 0 0 16px; }
.ll .ll-num { flex: none; width: 48px; height: 48px; border-radius: 50%; background: #1d5fc4; color: #fff; font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.ll .ll-step2 .ll-num { background: #5a3fb8; }
.ll .ll-title h2 { margin: 0; font-size: 28px; }

.ll .ll-field { background: #fff; border: 2px solid #9db9e3; border-radius: 12px; padding: 16px 18px; margin: 0 0 14px; }
.ll .ll-field strong { display: block; font-size: 20px; }
.ll .ll-field input[type=file] { font-size: 17px; margin-top: 10px; max-width: 100%; }
.ll .ll-field input[type=file]::file-selector-button { font-size: 17px; font-weight: 700; padding: 10px 18px; margin-right: 12px; border: 2px solid #1d5fc4; border-radius: 10px; background: #fff; color: #1d5fc4; cursor: pointer; }

.ll .ll-btn { font: inherit; font-size: 20px; font-weight: 700; padding: 14px 28px; border-radius: 12px; border: 2px solid #1d5fc4; background: #1d5fc4; color: #fff; cursor: pointer; }
.ll .ll-btn:hover { background: #174d9e; }
.ll .ll-btn-2 { background: #fff; color: #1d5fc4; }
.ll .ll-btn-2:hover { background: #eaf3ff; }
.ll .ll-btn:disabled { opacity: .6; cursor: wait; }
.ll .ll-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

.ll details { background: #fff8e1; border: 2px solid #d9a400; border-radius: 12px; margin: 18px 0 0; }
.ll summary { font-size: 20px; font-weight: 700; padding: 14px 18px; cursor: pointer; }
.ll .ll-help { padding: 0 20px 18px; }
.ll .ll-help ol { margin: 6px 0 12px 22px; padding: 0; }
.ll .ll-help li { margin: 4px 0; }
.ll pre { background: #fff; border: 1px solid #c9b46a; border-radius: 8px; padding: 12px; font-size: 15px; white-space: pre-wrap; margin: 8px 0; }

.ll .ll-hero { border-radius: 16px; padding: 22px 24px; margin: 0 0 18px; border: 2px solid; }
.ll .ll-hero h2 { font-size: 30px; margin: 0 0 4px; }
.ll .ll-hero p { margin: 0; font-size: 19px; }
.ll .ll-hero.ll-bad { background: #fdeceb; border-color: #c62828; }
.ll .ll-hero.ll-good { background: #e6f6ea; border-color: #2e7d32; }

.ll .ll-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin: 0 0 22px; }
.ll .ll-tile { border-radius: 14px; padding: 16px 18px; border: 2px solid; background: #fff; }
.ll .ll-tile b { display: block; font-size: 34px; line-height: 1.1; margin-top: 4px; }
.ll .ll-t-ok { border-color: #2e7d32; background: #e6f6ea; }
.ll .ll-t-bad { border-color: #c62828; background: #fdeceb; }
.ll .ll-t-way { border-color: #2f6fcb; background: #eaf3ff; }
.ll .ll-t-all { border-color: #7a7a7a; background: #f3f3f3; }

.ll .ll-section-title { font-size: 24px; font-weight: 800; margin: 26px 0 12px; }
.ll .ll-card { background: #fff; border-radius: 14px; border: 2px solid; border-left-width: 10px; padding: 16px 20px; margin: 0 0 14px; }
.ll .ll-card h3 { margin: 0; }
.ll .ll-card .ll-amount { font-size: 28px; font-weight: 800; margin: 2px 0 8px; }
.ll .ll-c-bad { border-color: #c62828; }
.ll .ll-c-warn { border-color: #c27a00; }
.ll .ll-c-info { border-color: #2f6fcb; }
.ll .ll-todo { background: #f3f3f3; border-radius: 10px; padding: 12px 14px; margin-top: 10px; }

.ll .ll-tablewrap { overflow-x: auto; background: #fff; border-radius: 14px; border: 2px solid #cfcfd6; }
.ll table { width: 100%; border-collapse: collapse; font-size: 17px; }
.ll th { text-align: left; padding: 12px 14px; background: #ebe7f8; font-size: 16px; white-space: nowrap; }
.ll td { padding: 12px 14px; border-top: 1px solid #e3e3e8; white-space: nowrap; }
.ll .ll-r { text-align: right; }
.ll .ll-pill { display: inline-block; padding: 3px 12px; border-radius: 999px; font-weight: 700; font-size: 15px; }
.ll .ll-p-ok { background: #cfeed6; color: #14531a; }
.ll .ll-p-way { background: #d6e6ff; color: #12418f; }
.ll .ll-p-bad { background: #f9cfcc; color: #7d1511; }
`;
