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
  const [showUpload, setShowUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 🧠 Prefetch cache (in-memory)
  const cacheRef = useRef<Record<string, JikanAnime>>({});

  // 1️⃣ Load and shuffle XML
  useEffect(() => {
    // Check if user has uploaded their own data
    const savedXml = localStorage.getItem("userAnimeXml");

    const loadXml = savedXml
      ? Promise.resolve(savedXml)
      : fetch("/anime.xml").then((res) => res.text());

    loadXml
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
        if (!savedXml) {
          setShowUpload(true); // Show upload prompt if using default data
        }
      })
      .catch((err) => {
        console.error("Failed to load xml:", err);
        setShowUpload(true);
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
          await new Promise((resolve) => setTimeout(resolve, 900));
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
    if (isCooldown) return;

    setIsCooldown(true);

    setTimeout(() => {
      setIsCooldown(false);
    }, 1000);

    const anime = animeList[currentIndex];
    if (!anime || !jikanData) return;

    setChoices((prev) => ({ ...prev, [anime.id]: choice }));

    if (choice === "liked") {
      setLikedShows((prev) => [...prev, jikanData]);
    }

    setCurrentIndex((i) => i + 1);
  };

  // 4️⃣ Handle file upload
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const xmlContent = e.target?.result as string;
      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlContent, "application/xml");
        const entries = Array.from(xml.getElementsByTagName("anime"));

        if (entries.length === 0) {
          alert(
            "No anime entries found in the file. Please check the XML format."
          );
          return;
        }

        const parsed: AnimeXml[] = entries.map((el) => ({
          id:
            el.getElementsByTagName("series_animedb_id")[0]?.textContent || "",
          title: el.getElementsByTagName("series_title")[0]?.textContent || "",
          status: el.getElementsByTagName("my_status")[0]?.textContent || "",
        }));

        localStorage.setItem("userAnimeXml", xmlContent);
        setAnimeList(shuffleArray(parsed));
        setCurrentIndex(0);
        setJikanData(null);
        setChoices({});
        setLikedShows([]);
        cacheRef.current = {};
        setShowUpload(false);
      } catch (err) {
        console.error("Failed to parse XML:", err);
        alert(
          "Failed to parse XML file. Please make sure it's a valid MyAnimeList export."
        );
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".xml")) {
      handleFileUpload(file);
    } else {
      alert("Please upload a valid XML file from MyAnimeList.");
    }
  };

  const handleClearData = () => {
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    localStorage.removeItem("userAnimeXml");
    window.location.reload();
  };

  const cancelClear = () => {
    setShowClearConfirm(false);
  };

  const currentAnime = animeList[currentIndex];

  return (
    <div className="min-h-screen flex flex-col items-center bg-neutral-950 text-white">
      <div className="min-h-10 bg-zinc-900 w-full max-w-full text-center shadow py-6 relative px-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Anime Picker</h1>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 sm:px-4 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition flex items-center gap-2 cursor-pointer"
          title={
            localStorage.getItem("userAnimeXml")
              ? "Change List"
              : "Upload Your List"
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12" />
            <path d="m17 8-5-5-5 5" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          </svg>
          <span className="hidden sm:inline text-sm">
            {localStorage.getItem("userAnimeXml")
              ? "Change List"
              : "Upload Your List"}
          </span>
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-xl p-8 max-w-md w-full shadow-2xl border border-white/10">
            <h2 className="text-2xl font-bold mb-4">Upload Your Own Data</h2>
            <p className="text-zinc-400 mb-6 text-sm">
              Export your own anime list from MyAnimeList <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener noreferrer" className="underline text-zinc-100 hover:text-zinc-300">here</a>, then upload it here.
            </p>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
                isDragging
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-700 hover:border-zinc-600"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-4 text-zinc-500"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              <p className="text-zinc-400 mb-2">
                Drag & drop your XML file here
              </p>
              <p className="text-zinc-500 text-sm mb-4">or</p>
              <label className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition">
                Browse Files
                <input
                  type="file"
                  accept=".xml"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex gap-2 mt-6">
              {localStorage.getItem("userAnimeXml") && (
                <button
                  onClick={handleClearData}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition cursor-pointer pointer-events-auto"
                >
                  Clear Data
                </button>
              )}
              <button
                onClick={() => setShowUpload(false)}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition cursor-pointer pointer-events-auto"
              >
                {localStorage.getItem("userAnimeXml")
                  ? "Continue"
                  : "Use Demo List"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* delete confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-white/10">
            <h3 className="text-lg font-semibold mb-3 text-white">
              Clear Data?
            </h3>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to clear your uploaded data and use the
              default list?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelClear}
                className="px-4 py-2 rounded bg-zinc-800 text-white hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}

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
          <p className="text-sm text-zinc-400 mb-6">
            Status: {currentAnime.status || "N/A"}
          </p>
        </div>
      ) : (
        <div className="text-zinc-400 mt-12 text-center mb-10">
          {currentAnime ? "Loading anime data..." : "No more anime to show 🎉"}
        </div>
      )}

      {/* Progress info */}
      <div className="w-full max-w-xs flex justify-between text-sm text-zinc-500 mb-10">
        <div>
          {animeList.length > 0
            ? `${currentIndex + 1}/${animeList.length}`
            : "Loading..."}
        </div>
        <div>{currentAnime ? `ID: ${currentAnime.id}` : ""}</div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-20 pb-10 mb-10">
        <button
          title="Dislike"
          onClick={() => handleChoice("disliked")}
          className="relative flex items-center justify-center w-14 h-14 
             bg-neutral-800 rounded-full
             hover:bg-neutral-700 active:translate-y-[2px] active:shadow-inner transition
             before:absolute before:inset-0 before:rounded-full before:border-t before:border-white/15
             after:absolute after:inset-0 after:rounded-full after:border-b after:border-black/40
             shadow-[0_8px_20px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.3)]
             overflow-hidden cursor-pointer"
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
          className="relative flex items-center justify-center w-14 h-14 
             bg-neutral-800 rounded-full
             hover:bg-neutral-700 active:translate-y-[2px] active:shadow-inner transition
             before:absolute before:inset-0 before:rounded-full before:border-t before:border-white/15
             after:absolute after:inset-0 after:rounded-full after:border-b after:border-black/40
             shadow-[0_8px_20px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.3)]
             overflow-hidden cursor-pointer"
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

      {/* ❤️ Liked shows section */}
      {likedShows.length > 0 && (
        <>
          <h2 className="text-2xl font-semibold mb-4 text-center">
            Liked Animes
          </h2>
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
        </>
      )}
    </div>
  );
}

export default App;
