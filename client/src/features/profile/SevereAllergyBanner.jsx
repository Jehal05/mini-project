/**
 * Feature 14: the red banner shown wherever a patient record is displayed.
 * Pass any list of allergies. Entries with a `severity` count only when it is "severe"; entries without one
 * (the passport's emergency tier lists severe allergies only) are shown as they are. Nothing shows if none apply.
 * Reusable by other portals: `import { SevereAllergyBanner } from '../features/profile'`.
 */
export default function SevereAllergyBanner({ allergies = [] }) {
  const items = allergies.filter((a) => (a.severity ? a.severity === 'severe' : true));
  if (items.length === 0) return null;
  return (
    <div className="severe-banner" role="alert">
      <strong>⚠ Severe allergy</strong>
      <ul>
        {items.map((a, i) => (
          <li key={a._id ?? `${a.allergen}-${i}`}>{a.allergen}{a.reaction ? ` — ${a.reaction}` : ''}</li>
        ))}
      </ul>
    </div>
  );
}
