import { Icon, type IconName } from "../Icon/Icon";
import "./Chip.css";

/**
 * Figma: Chip (87:96). An outline pill on dark backgrounds with a 16 px icon and a Body/Small fact (D-99).
 * Not a button and not a status: tip states use Status badge, screen states use Tag (rules §4.4).
 */
export function Chip({ icon, children }: { icon: IconName; children: string }) {
  return (
    <span className="chip text-body-small">
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}
