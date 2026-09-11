import type { CSSProperties } from "react";

const coats = ["#819477", "#BD895E", "#7C8F9A", "#AA786B", "#9A8DAD", "#B19C68"];
const skins = ["#D9AA86", "#B9805C", "#E7C1A1", "#956748"];
const hairs = ["#37312B", "#5C4232", "#BCB5A7", "#322C29"];

/** Identity is deterministic; pose reflects execution, never an inferred role. */
export function OfficeCharacter({ agentId, working }: { agentId: string; working: boolean }) {
  let hash = 0;
  for (const char of agentId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const coat = coats[hash % coats.length];
  const skin = skins[(hash >>> 3) % skins.length];
  const hair = hairs[(hash >>> 6) % hairs.length];
  const style = { "--oc-coat": coat, "--oc-skin": skin } as CSSProperties;
  return <svg className={`officeCharacter ${working ? "ocWorking" : ""}`} style={style} viewBox="0 0 64 90" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="84" rx="21" ry="4" fill="#171511" opacity=".25" />
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
