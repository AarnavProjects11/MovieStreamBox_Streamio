import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDetails } from "@/lib/movie-api/movies.functions";
import type { CatalogItem } from "@/lib/movie-api/provider";
import PlayIcon from "@/static/images/play-button.svg";

interface NetflixModalProps {
  item: CatalogItem;
  onClose: () => void;
}

/**
 * Clone Modal (components/UI/Modal.js + Movie/MovieDetails.js): a full-width
 * backdrop image band that drops in below the top of the viewport, with a
 * left-to-right black gradient carrying the title, rating, runtime and
 * synopsis. Closes on backdrop click or Escape.
 */
export function NetflixModal({ item, onClose }: NetflixModalProps) {
  const fetchDetails = useServerFn(getDetails);
  const details = useQuery({
    queryKey: ["details", item.type, item.id],
    queryFn: () => fetchDetails({ data: { type: item.type, id: item.id } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const meta = details.data;
  const backdrop = meta?.background ?? item.background ?? item.poster ?? meta?.poster;
  const title = meta?.name ?? item.name;
  const overview = meta?.description ?? item.description;
  const year = meta?.year ?? item.year;
  const rating = item.rating;
  const runtime = meta?.runtime;
  const facts = [
    year ? `Year: ${year}` : null,
    runtime ? `Runtime: ${runtime}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const counts = [
    meta?.seasons?.length ? `Seasons: ${meta.seasons.length}` : null,
    meta?.episodes?.length ? `Episodes: ${meta.episodes.length}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const style = backdrop
    ? { backgroundImage: `url(${backdrop})`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  const detailsTo = item.type === "movie" ? "/browse/movie/$id" : "/browse/series/$id";

  return (
    <>
      <div className="nf-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="nf-modal is-show" style={style} role="dialog" aria-modal="true" aria-label={title}>
        <div className="nf-modal__container">
          <h2 className="nf-modal__title">{title}</h2>

          {(rating || facts) && (
            <p className="nf-modal__info">
              {rating && <span className="nf-modal__rating">Rating: {rating}</span>}
              {rating && facts ? " · " : null}
              {facts}
            </p>
          )}

          {counts && <p className="nf-modal__episode">{counts}</p>}

          {overview && <p className="nf-modal__overview">{overview}</p>}

          <Link
            to="/browse/watch/$type/$id"
            params={{ type: item.type, id: item.id }}
            className="nf-modal__btn nf-modal__btn--red"
          >
            <img src={PlayIcon} alt="" aria-hidden="true" />
            Play
          </Link>
          <Link
            to={detailsTo}
            params={{ id: item.id }}
            className="nf-modal__btn"
            onClick={onClose}
          >
            More Info
          </Link>
        </div>
      </div>
    </>
  );
}
