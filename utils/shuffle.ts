
// Fisher-Yates shuffle algorithm
export function shuffle<T,>(array: T[]): T[] {
  const newArray = [...array];
  let currentIndex = newArray.length;
  let randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]
    ];
  }

  return newArray;
}
