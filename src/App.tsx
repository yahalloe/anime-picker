import { useEffect, useState, useRef } from "react";

interface AnimeXml {
  id: string;
  title: string;
  status: string;
}

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url?: string;
    };
  };
  synopsis: string | null;
  episodes: number | null;
  type: string | null;
  status: string | null;
  score: number | null;
}

// Fisher–Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function App() {
  const [animeList, setAnimeList] = useState<AnimeXml[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [jikanData, setJikanData] = useState<JikanAnime | null>(null);
  const [_choices, setChoices] = useState<Record<string, "liked" | "disliked">>(
    {}
  );
  const [likedShows, setLikedShows] = useState<JikanAnime[]>([]);
  const [isCooldown, setIsCooldown] = useState(false);

  // 🧠 Prefetch cache (in-memory)
  const cacheRef = useRef<Record<string, JikanAnime>>({});

  // 1️⃣ Load and shuffle XML
  useEffect(() => {
    fetch("/anime.xml")
      .then((res) => res.text())
      .then((str) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(str, "application/xml");
        const entries = Array.from(xml.getElementsByTagName("anime"));
        const parsed: AnimeXml[] = entries.map((el) => ({
          id:
            el.getElementsByTagName("series_animedb_id")[0]?.textContent || "",
          title: el.getElementsByTagName("series_title")[0]?.textContent || "",
          status: el.getElementsByTagName("my_status")[0]?.textContent || "",
        }));
        setAnimeList(shuffleArray(parsed));
      })
      .catch((err) => {
        console.error("Failed to load xml:", err);
      });
  }, []);

  // 2️⃣ Fetch + prefetch Jikan data
  useEffect(() => {
    const anime = animeList[currentIndex];
    if (!anime) {
      setJikanData(null);
      return;
    }

    const loadAnimeData = async (id: string) => {
      // Check if cached
      if (cacheRef.current[id]) {
        setJikanData(cacheRef.current[id]);
        return;
      }

      const idNum = parseInt(id, 10);
      if (isNaN(idNum)) return;

      try {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${idNum}`);
        if (!res.ok) throw new Error(`Jikan fetch failed: ${res.status}`);
        const json = await res.json();
        cacheRef.current[id] = json.data as JikanAnime;
        setJikanData(json.data as JikanAnime);
      } catch (err) {
        console.error("Jikan fetch error:", err);
        setJikanData(null);
      }
    };

    loadAnimeData(anime.id);

    // Prefetch next 3 anime
    const prefetchNext = async () => {
      for (let i = currentIndex + 1; i < currentIndex + 4; i++) {
        const next = animeList[i];
        if (!next || cacheRef.current[next.id]) continue;

        const idNum = parseInt(next.id, 10);
        if (isNaN(idNum)) continue;

        try {
          await new Promise((resolve) => setTimeout(resolve, 900)); // 🕒 wait 600ms between requests
          const res = await fetch(`https://api.jikan.moe/v4/anime/${idNum}`);
          if (!res.ok) continue;
          const json = await res.json();
          cacheRef.current[next.id] = json.data as JikanAnime;
        } catch (err) {
          console.warn("Prefetch failed:", err);
        }
      }
    };

    prefetchNext();
  }, [animeList, currentIndex]);

  // 3️⃣ Handle like/dislike
  const handleChoice = (choice: "liked" | "disliked") => {
    if (isCooldown) return; // ignore clicks during cooldown

    setIsCooldown(true);
    // your existing handleChoice logic here

    setTimeout(() => {
      setIsCooldown(false);
    }, 1000); // 1 second cooldown

    const anime = animeList[currentIndex];
    if (!anime || !jikanData) return;

    setChoices((prev) => ({ ...prev, [anime.id]: choice }));

    if (choice === "liked") {
      setLikedShows((prev) => [...prev, jikanData]);
    }

    setCurrentIndex((i) => i + 1);
  };

  const currentAnime = animeList[currentIndex];

  return (
    <div className="min-h-screen flex flex-col items-center bg-neutral-950 text-white">
      <div className="min-h-10 bg-zinc-900 w-full max-w-full text-center shadow py-6">
        <h1 className="text-3xl font-bold">Anime Picker</h1>
      </div>

      {/* Main Picker */}
      {currentAnime && jikanData ? (
        <div
          className="relative flex flex-col items-center bg-neutral-900 p-6 rounded-xl w-full max-w-xs mb-10 mt-10
             before:absolute before:inset-0 before:rounded-xl before:border-t before:border-white/15
             after:absolute after:inset-0 after:rounded-xl after:border-b after:border-black/40
             shadow-[0_10px_25px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.3)]
             overflow-hidden"
        >
          <img
            src={jikanData.images.jpg.large_image_url}
            alt={jikanData.title}
            className="rounded-lg mb-4 object-contain w-auto h-auto"
          />
          <div className="text-center mb-4">
            {jikanData.title_english && (
              <h2 className="text-3xl font-bold ">{jikanData.title_english}</h2>
            )}
            <h2 className="text-sm text-stone-400 italic pt-3">
              {jikanData.title}
            </h2>
          </div>
          <p className="text-lg text-zinc-300 mb-4 text-center">
            {jikanData.type ?? "Unknown"} • {jikanData.episodes ?? "?"} eps • ⭐{" "}
            {jikanData.score ?? "N/A"}
          </p>
          <p className="text-sm text-zinc-400 mb-6 italic">
            Status: {currentAnime.status || "N/A"}
          </p>
        </div>
      ) : (
        <div className="text-zinc-400 mt-12 text-center mb-10">
          {currentAnime ? "Loading anime data..." : "No more anime to show 🎉"}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-6">
        <button
          title="Dislike"
          onClick={() => handleChoice("disliked")}
          className="relative py-3 px-5 text-lg font-medium bg-neutral-800 rounded-lg
             hover:bg-neutral-700 active:translate-y-[2px] active:shadow-inner transition
             before:absolute before:inset-0 before:rounded-lg before:border-t before:border-white/15
             after:absolute after:inset-0 after:rounded-lg after:border-b after:border-black/40
             shadow-[0_8px_20px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.3)]
             overflow-hidden"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-x-icon lucide-x"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <button
          title="like"
          onClick={() => handleChoice("liked")}
          className="relative py-3 px-5 text-lg font-medium bg-neutral-800 rounded-lg
             hover:bg-neutral-700 active:translate-y-[2px] active:shadow-inner transition
             before:absolute before:inset-0 before:rounded-lg before:border-t before:border-white/15
             after:absolute after:inset-0 after:rounded-lg after:border-b after:border-black/40
             shadow-[0_8px_20px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.3)]
             overflow-hidden"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-heart-icon lucide-heart"
          >
            <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
          </svg>
        </button>
      </div>

      {/* Progress info */}
      <div className="w-full max-w-xs flex justify-between text-sm text-zinc-500 mb-10 pb-10">
        <div>
          {animeList.length > 0
            ? `${currentIndex + 1}/${animeList.length}`
            : "Loading..."}
        </div>
        <div>{currentAnime ? `ID: ${currentAnime.id}` : ""}</div>
      </div>

      {/* ❤️ Liked shows section */}
      <h2 className="text-2xl font-semibold mb-4 text-center">Liked Animes</h2>
      {likedShows.length > 0 && (
        <div className="w-full flex justify-center">
          <div className="w-full max-w-xs mb-10 lg:max-w-5xl rounded-xl p-6 shadow-lg border border-white/10 bg-zinc-950 highlight-white/90">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {likedShows.map((anime) => (
                <div
                  key={anime.mal_id}
                  className="relative flex flex-col items-center bg-zinc-900 rounded-lg p-3 shadow hover:bg-zinc-800 transition
                       before:absolute before:inset-0 before:rounded-lg before:border-t before:border-white/10
                       after:absolute after:inset-0 after:rounded-lg after:border-b after:border-black/40
                       shadow-[0_8px_20px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.3)]
                       overflow-hidden"
                >
                  <img
                    src={anime.images.jpg.image_url}
                    alt={anime.title}
                    className="w-full h-auto rounded-md mb-2"
                  />
                  <p className="text-center text-sm font-medium">
                    {anime.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
