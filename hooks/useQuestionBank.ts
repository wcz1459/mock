
import { useState, useEffect } from 'react';
import type { Question } from '../types';

export const useQuestionBank = (url: string) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndParse = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`无法加载题库: HTTP error! status: ${response.status}. 请确认目录下有名为 tk.txt 的题库文件。`);
        }
        const text = await response.text();
        const questionBlocks = text.split('[I]').filter(q => q.trim());
        
        const parsedQuestions: Question[] = questionBlocks.map((block) => {
          const lines = block.trim().split('\n').filter(line => line.trim());
          const id = lines[0].trim();
          const questionText = lines.find(l => l.startsWith('[Q]'))?.substring(3).trim() || '';
          const options = lines.filter(l => ['[A]', '[B]', '[C]', '[D]'].some(prefix => l.startsWith(prefix)))
                               .map(l => l.substring(3).trim());
          const correctAnswerLine = lines.find(l => l.startsWith('[A]'));
          const correctAnswer = correctAnswerLine ? correctAnswerLine.substring(3).trim() : '';

          if (!id || !questionText || options.length !== 4 || !correctAnswer) {
            console.warn('Skipping malformed question block:', block);
            return null;
          }
          
          return { id, question: questionText, options, correctAnswer };
        }).filter((q): q is Question => q !== null);

        setQuestions(parsedQuestions);
      } catch (e: unknown) {
        if (e instanceof Error) {
            setError(e.message);
        } else {
            setError('发生未知错误');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndParse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { questions, isLoading, error };
};
