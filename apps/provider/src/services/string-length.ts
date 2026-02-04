/**
 * String length service - simple example service for demo
 */
export function computeStringLength(text: string): number {
  return [...text].length; // Handle unicode correctly
}

export interface StringLengthRequest {
  text: string;
}

export interface StringLengthResult {
  length: number;
  text: string;
}

export function processStringLength(req: StringLengthRequest): StringLengthResult {
  return {
    length: computeStringLength(req.text),
    text: req.text,
  };
}
