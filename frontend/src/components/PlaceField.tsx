import { useEffect, useState } from 'react'
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import { searchPlaces } from '../lib/api'
import type { Place } from '../lib/types'

interface Props {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
  icon: React.ReactNode
  error?: string
}

/** Debounced place search backed by the API's geocoder. */
export default function PlaceField({ label, value, onChange, icon, error }: Props) {
  const [input, setInput] = useState('')
  const [options, setOptions] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = input.trim()
    if (q.length < 2 || q === value?.label) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchPlaces(q, controller.signal)
        .then((res) => setOptions(res.results))
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setOptions([])
        })
        .finally(() => setLoading(false))
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [input, value?.label])

  return (
    <Autocomplete
      value={value}
      options={value && !options.some((o) => o.label === value.label) ? [value, ...options] : options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.lat === b.lat && a.lon === b.lon}
      onChange={(_, place) => onChange(place)}
      onInputChange={(_, text) => setInput(text)}
      loading={loading}
      noOptionsText={input.trim().length < 2 ? 'Type a city or address' : 'No places found'}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string }
        return (
          <Box component="li" key={key} {...rest} sx={{ gap: 1.25 }}>
            <PlaceRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2">{option.label}</Typography>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          error={Boolean(error)}
          helperText={error}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <Box sx={{ display: 'flex', mr: 0.5, ml: 0.25, color: 'primary.main' }}>{icon}</Box>
              ),
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
            htmlInput: { ...params.slotProps.htmlInput, maxLength: 120 },
          }}
        />
      )}
    />
  )
}
