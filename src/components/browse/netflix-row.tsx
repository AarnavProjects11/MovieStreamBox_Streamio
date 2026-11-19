import { useState } from "react";
import type { CatalogItem } from "@/lib/movie-api/provider";
import { NetflixModal } from "./netflix-modal";

interface NetflixRowProps {
  title: string;
  items: CatalogItem[];
}

/**
 * Netflix TV browse row: the first title is a wide, white-framed billboard and
 * the rest of the row is a strip of portrait posters. The billboard's facts and
 * synopsis sit directly underneath, which is where the TV UI puts focus info.
 * Selecting any tile opens the details modal.
 */
export function NetflixRow({ title, items }: NetflixRowProps) {
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const shown = (items ?? []).filter((item) => item.poster ?? item.background);
  if (!shown.length) return null;

  const [spotlight, ...rest] = shown;

  // Narrow facts for rows that are not full catalog entries (history items carry
  // only a name and poster), so the panel never renders a lone "Film".
  const summary = [
    ...(spotlight.genres ?? []).slice(0, 2),
    spotlight.year,
    spotlight.rating,
  ].filter(Boolean);
  const facts = summary.length
    ? [...summary, spotlight.type === "series" ? "Series" : "Film"].join(" • ")
    : "";

  const backdrop = spotlight.background;
  const art = backdrop ?? spotlight.poster;

  return (
    <section className="nf-row">
      <h2 className="nf-row__heading">{title}</h2>

      <div className="nf-row__track">
        <button
          type="button"
          className="nf-spot"
          onClick={() => setSelected(spotlight)}
          aria-label={`${spotlight.name} — details`}
        >
          <span className="nf-spot__art">
            {backdrop ? (
              <img className="nf-spot__img" src={backdrop} alt="" loading="lazy" />
            ) : (
              <>
                {/* No wide key art: keep the real poster intact on a blurred wash
                    instead of zoom-cropping it into an unrecognisable still. */}
                <span
                  className="nf-spot__wash"
                  style={art ? { backgroundImage: `url("${art}")` } : undefined}
                />
                {art && <img className="nf-spot__poster" src={art} alt="" loading="lazy" />}
              </>
            )}
            <span className="nf-spot__scrim" />
            <span className="nf-spot__caption">
              <span className="nf-spot__eyebrow">
                <b>M</b>
                {spotlight.type === "series" ? "Series" : "Film"}
              </span>
              <span className="nf-spot__title">{spotlight.name}</span>
            </span>
          </span>
        </button>

        {rest.map((item, index) => (
          <button
            key={`${item.id}-${index}`}
            type="button"
            className="nf-row__item"
            onClick={() => setSelected(item)}
            aria-label={`${item.name} — details`}
          >
            <img
              src={item.poster ?? item.background}
              alt=""
              className="nf-row__poster"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {(facts || spotlight.description) && (
        <div className="nf-row__details">
          {facts && <p className="nf-row__meta">{facts}</p>}
          {spotlight.description && <p className="nf-row__overview">{spotlight.description}</p>}
        </div>
      )}

      {selected && <NetflixModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
