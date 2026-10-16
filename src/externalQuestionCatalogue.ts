export interface ExternalQuestion {
  id: string
  title: string
  url: string
  platform: string
  topic: string
  pattern: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
}

export const builtInExternalQuestionCatalogue: ExternalQuestion[] = [
  { id: 'contains-duplicate', title: 'Contains Duplicate', url: 'https://leetcode.com/problems/contains-duplicate/', platform: 'LeetCode', topic: 'Arrays & Hashing', pattern: 'Hash Set', difficulty: 'Easy' },
  { id: 'valid-anagram', title: 'Valid Anagram', url: 'https://leetcode.com/problems/valid-anagram/', platform: 'LeetCode', topic: 'Arrays & Hashing', pattern: 'Frequency Counting', difficulty: 'Easy' },
  { id: 'best-time-to-buy-and-sell-stock', title: 'Best Time to Buy and Sell Stock', url: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/', platform: 'LeetCode', topic: 'Arrays', pattern: 'Sliding Window', difficulty: 'Easy' },
  { id: 'valid-palindrome', title: 'Valid Palindrome', url: 'https://leetcode.com/problems/valid-palindrome/', platform: 'LeetCode', topic: 'Strings', pattern: 'Two Pointers', difficulty: 'Easy' },
  { id: 'merge-two-sorted-lists', title: 'Merge Two Sorted Lists', url: 'https://leetcode.com/problems/merge-two-sorted-lists/', platform: 'LeetCode', topic: 'Linked List', pattern: 'Merge Two Lists', difficulty: 'Easy' },
  { id: 'linked-list-cycle', title: 'Linked List Cycle', url: 'https://leetcode.com/problems/linked-list-cycle/', platform: 'LeetCode', topic: 'Linked List', pattern: 'Fast & Slow Pointers', difficulty: 'Easy' },
  { id: 'binary-search', title: 'Binary Search', url: 'https://leetcode.com/problems/binary-search/', platform: 'LeetCode', topic: 'Binary Search', pattern: 'Binary Search', difficulty: 'Easy' },
  { id: 'flood-fill', title: 'Flood Fill', url: 'https://leetcode.com/problems/flood-fill/', platform: 'LeetCode', topic: 'Graphs', pattern: 'Depth-First Search', difficulty: 'Easy' },
  { id: 'climbing-stairs', title: 'Climbing Stairs', url: 'https://leetcode.com/problems/climbing-stairs/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: '1D Dynamic Programming', difficulty: 'Easy' },
  { id: 'min-stack', title: 'Min Stack', url: 'https://leetcode.com/problems/min-stack/', platform: 'LeetCode', topic: 'Stack', pattern: 'Monotonic Stack', difficulty: 'Medium' },
  { id: 'same-tree', title: 'Same Tree', url: 'https://leetcode.com/problems/same-tree/', platform: 'LeetCode', topic: 'Trees', pattern: 'Tree DFS', difficulty: 'Easy' },
  { id: 'invert-binary-tree', title: 'Invert Binary Tree', url: 'https://leetcode.com/problems/invert-binary-tree/', platform: 'LeetCode', topic: 'Trees', pattern: 'Tree DFS', difficulty: 'Easy' },
  { id: 'group-anagrams', title: 'Group Anagrams', url: 'https://leetcode.com/problems/group-anagrams/', platform: 'LeetCode', topic: 'Arrays & Hashing', pattern: 'Hash Map', difficulty: 'Medium' },
  { id: 'product-of-array-except-self', title: 'Product of Array Except Self', url: 'https://leetcode.com/problems/product-of-array-except-self/', platform: 'LeetCode', topic: 'Arrays', pattern: 'Prefix & Suffix', difficulty: 'Medium' },
  { id: 'longest-substring-without-repeating-characters', title: 'Longest Substring Without Repeating Characters', url: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/', platform: 'LeetCode', topic: 'Strings', pattern: 'Sliding Window', difficulty: 'Medium' },
  { id: '3sum', title: '3Sum', url: 'https://leetcode.com/problems/3sum/', platform: 'LeetCode', topic: 'Arrays', pattern: 'Two Pointers', difficulty: 'Medium' },
  { id: 'container-with-most-water', title: 'Container With Most Water', url: 'https://leetcode.com/problems/container-with-most-water/', platform: 'LeetCode', topic: 'Arrays', pattern: 'Two Pointers', difficulty: 'Medium' },
  { id: 'search-in-rotated-sorted-array', title: 'Search in Rotated Sorted Array', url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/', platform: 'LeetCode', topic: 'Binary Search', pattern: 'Modified Binary Search', difficulty: 'Medium' },
  { id: 'number-of-islands', title: 'Number of Islands', url: 'https://leetcode.com/problems/number-of-islands/', platform: 'LeetCode', topic: 'Graphs', pattern: 'Depth-First Search', difficulty: 'Medium' },
  { id: 'course-schedule', title: 'Course Schedule', url: 'https://leetcode.com/problems/course-schedule/', platform: 'LeetCode', topic: 'Graphs', pattern: 'Topological Sort', difficulty: 'Medium' },
  { id: 'coin-change', title: 'Coin Change', url: 'https://leetcode.com/problems/coin-change/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: 'Unbounded Knapsack', difficulty: 'Medium' },
  { id: 'house-robber', title: 'House Robber', url: 'https://leetcode.com/problems/house-robber/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: '1D Dynamic Programming', difficulty: 'Medium' },
  { id: 'longest-increasing-subsequence', title: 'Longest Increasing Subsequence', url: 'https://leetcode.com/problems/longest-increasing-subsequence/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: 'Longest Increasing Subsequence', difficulty: 'Medium' },
  { id: 'unique-paths', title: 'Unique Paths', url: 'https://leetcode.com/problems/unique-paths/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: 'Grid Dynamic Programming', difficulty: 'Medium' },
  { id: 'word-break', title: 'Word Break', url: 'https://leetcode.com/problems/word-break/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: 'String Dynamic Programming', difficulty: 'Medium' },
  { id: 'combination-sum', title: 'Combination Sum', url: 'https://leetcode.com/problems/combination-sum/', platform: 'LeetCode', topic: 'Backtracking', pattern: 'Decision Tree', difficulty: 'Medium' },
  { id: 'top-k-frequent-elements', title: 'Top K Frequent Elements', url: 'https://leetcode.com/problems/top-k-frequent-elements/', platform: 'LeetCode', topic: 'Arrays & Hashing', pattern: 'Heap / Priority Queue', difficulty: 'Medium' },
  { id: 'kth-largest-element-in-an-array', title: 'Kth Largest Element in an Array', url: 'https://leetcode.com/problems/kth-largest-element-in-an-array/', platform: 'LeetCode', topic: 'Arrays', pattern: 'Quickselect', difficulty: 'Medium' },
  { id: 'daily-temperatures', title: 'Daily Temperatures', url: 'https://leetcode.com/problems/daily-temperatures/', platform: 'LeetCode', topic: 'Stack', pattern: 'Monotonic Stack', difficulty: 'Medium' },
  { id: 'decode-string', title: 'Decode String', url: 'https://leetcode.com/problems/decode-string/', platform: 'LeetCode', topic: 'Stack', pattern: 'Stack Parsing', difficulty: 'Medium' },
  { id: 'lru-cache', title: 'LRU Cache', url: 'https://leetcode.com/problems/lru-cache/', platform: 'LeetCode', topic: 'Design', pattern: 'Hash Map + Doubly Linked List', difficulty: 'Medium' },
  { id: 'validate-binary-search-tree', title: 'Validate Binary Search Tree', url: 'https://leetcode.com/problems/validate-binary-search-tree/', platform: 'LeetCode', topic: 'Trees', pattern: 'Tree DFS', difficulty: 'Medium' },
  { id: 'trapping-rain-water', title: 'Trapping Rain Water', url: 'https://leetcode.com/problems/trapping-rain-water/', platform: 'LeetCode', topic: 'Arrays', pattern: 'Two Pointers', difficulty: 'Hard' },
  { id: 'word-ladder', title: 'Word Ladder', url: 'https://leetcode.com/problems/word-ladder/', platform: 'LeetCode', topic: 'Graphs', pattern: 'Breadth-First Search', difficulty: 'Hard' },
  { id: 'edit-distance', title: 'Edit Distance', url: 'https://leetcode.com/problems/edit-distance/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: '2D Dynamic Programming', difficulty: 'Hard' },
  { id: 'regular-expression-matching', title: 'Regular Expression Matching', url: 'https://leetcode.com/problems/regular-expression-matching/', platform: 'LeetCode', topic: 'Dynamic Programming', pattern: '2D Dynamic Programming', difficulty: 'Hard' },
  { id: 'median-of-two-sorted-arrays', title: 'Median of Two Sorted Arrays', url: 'https://leetcode.com/problems/median-of-two-sorted-arrays/', platform: 'LeetCode', topic: 'Binary Search', pattern: 'Binary Search on Partition', difficulty: 'Hard' },
]
