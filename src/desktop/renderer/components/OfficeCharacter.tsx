import { useId, type CSSProperties } from "react";

const coats = ["#819477", "#BD895E", "#7C8F9A", "#AA786B", "#9A8DAD", "#B19C68"];
const skins = ["#D9AA86", "#B9805C", "#E7C1A1", "#956748"];
const hairs = ["#37312B", "#5C4232", "#BCB5A7", "#322C29"];

/** Identity is deterministic; pose reflects execution, never an inferred role. */
export function OfficeCharacter({ agentId, working, seated = false }: { agentId: string; working: boolean; seated?: boolean }) {
  const fabricId = useId();
  let hash = 0;
  for (const char of agentId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const coat = coats[hash % coats.length];
  const skin = skins[(hash >>> 3) % skins.length];
  const hair = hairs[(hash >>> 6) % hairs.length];
  const style = { "--oc-coat": coat, "--oc-skin": skin } as CSSProperties;
  return <svg className={`officeCharacter ${working ? "ocWorking" : ""} ${seated ? "ocAtDesk" : ""}`} style={style} viewBox="0 0 64 90" aria-hidden="true" focusable="false">
    <defs><linearGradient id={fabricId} x1="0" y1="0" x2="1" y2="1"><stop stopColor={coat}/><stop offset=".5" stopColor={coat}/><stop offset="1" stopColor="#343c32"/></linearGradient></defs>
    <g className="ocSeated">
      <ellipse cx="32" cy="77" rx="24" ry="6" fill="#20251f" opacity=".25"/>
      <path d="M19 51 Q14 57 15 68 L23 70 L29 53 M35 53 L42 70 L50 67 Q49 57 44 51" fill="#424943"/>
      <path d="M19 31 Q32 25 45 31 L47 55 Q32 65 17 55Z" fill={`url(#${fabricId})`} stroke="#353e33" strokeWidth=".6"/>
      <path d="M27 34 Q29 46 26 55 M37 34 Q35 48 40 56" fill="none" stroke="#eef0db" opacity=".12"/>
      <g className="ocSeatedArm"><path d="M20 35 Q12 42 12 31 L17 23" fill="none" stroke={coat} strokeWidth="8" strokeLinecap="round"/><ellipse cx="18" cy="22" rx="4" ry="3" fill={skin}/></g>
      <g className="ocSeatedArm"><path d="M44 35 Q52 42 52 31 L47 23" fill="none" stroke={coat} strokeWidth="8" strokeLinecap="round"/><ellipse cx="46" cy="22" rx="4" ry="3" fill={skin}/></g>
      <rect x="28" y="25" width="8" height="8" rx="3" fill={skin}/>
      <ellipse cx="32" cy="20" rx="12" ry="14" fill={hair}/>
      <path d="M23 12 Q29 6 37 12" stroke="#e1d2b6" strokeOpacity=".16" strokeWidth="3" fill="none"/>
      <path d="M17 53 Q32 48 47 53 L46 68 Q32 76 18 68Z" fill="#59644f" stroke="#343e32" strokeWidth="2"/>
      <path d="M22 56 Q32 53 42 56" stroke="#8f9c7c" fill="none" strokeWidth="2"/>
    </g>
    <ellipse className="ocStandingShadow" cx="32" cy="84" rx="21" ry="4" fill="#171511" opacity=".25" />
    <g className="ocBody">
      <g className="ocLeg ocLegLeft"><path d="M23 55 L31 55 L29 79 L22 79Z" fill="#41474A"/><path d="M22 77 Q18 80 19 83 L30 83 L30 77Z" fill="#272A29"/></g>
      <g className="ocLeg ocLegRight"><path d="M33 55 L41 55 L43 79 L35 79Z" fill="#50565A"/><path d="M35 77 L35 83 L47 83 Q47 80 42 77Z" fill="#272A29"/></g>
      <path d="M21 33 Q32 27 43 33 L45 58 Q32 63 19 58Z" fill={coat}/>
      <path d="M30 32 L34 32 L34 57 L30 57Z" fill="#F2E9D9" opacity=".22"/>
      <path d="M26 31 L32 38 L38 31" fill="none" stroke="#F2E9D9" strokeWidth="2" opacity=".7"/>
      <g className="ocArm ocArmLeft"><path d="M22 35 Q15 43 17 56" fill="none" stroke={coat} strokeWidth="8" strokeLinecap="round"/><circle cx="17" cy="58" r="4" fill={skin}/></g>
      <g className="ocArm ocArmRight"><path d="M42 35 Q49 43 47 56" fill="none" stroke={coat} strokeWidth="8" strokeLinecap="round"/><circle cx="47" cy="58" r="4" fill={skin}/></g>
      <rect x="28" y="26" width="8" height="9" rx="3" fill={skin}/>
      <ellipse cx="32" cy="20" rx="12" ry="14" fill={skin}/>
      <path d={hash % 2 ? "M20 23 Q13 3 32 3 Q48 3 45 23 L40 16 Q26 21 21 13Z" : "M20 22 Q14 5 29 4 Q44 1 45 19 L39 13 Q32 17 23 13Z"} fill={hair}/>
      <path d="M36 24 Q33 26 30 24" fill="none" stroke="#704D3C" strokeWidth="1" opacity=".5"/>
    </g>
    <g className="ocNotebook"><rect x="17" y="47" width="30" height="18" rx="3" fill="#EFE4CE" stroke="#9C927E"/><path d="M23 53 H41 M23 57 H37" stroke="#8E9A87" strokeWidth="2"/></g>
  </svg>;
}
