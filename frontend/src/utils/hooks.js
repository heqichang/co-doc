import { useEffect, useRef } from 'react'

export function useDebounce(callback, delay) {
  const callbackRef = useRef(callback)
  const timeoutRef = useRef(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  function debounced(...args) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args)
    }, delay)
  }

  return debounced
}

export function useLocalStorage(key, initialValue) {
  const storedValue = localStorage.getItem(key)
  let value = initialValue
  if (storedValue !== null) {
    try {
      value = JSON.parse(storedValue)
    } catch {
      value = storedValue
    }
  }

  const setValue = (newValue) => {
    if (newValue === null || newValue === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(newValue))
    }
  }

  return [value, setValue]
}
