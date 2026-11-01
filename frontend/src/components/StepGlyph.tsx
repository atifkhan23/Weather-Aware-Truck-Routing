import StraightRoundedIcon from '@mui/icons-material/StraightRounded'
import TurnLeftRoundedIcon from '@mui/icons-material/TurnLeftRounded'
import TurnRightRoundedIcon from '@mui/icons-material/TurnRightRounded'
import TurnSlightLeftRoundedIcon from '@mui/icons-material/TurnSlightLeftRounded'
import TurnSlightRightRoundedIcon from '@mui/icons-material/TurnSlightRightRounded'
import TurnSharpLeftRoundedIcon from '@mui/icons-material/TurnSharpLeftRounded'
import TurnSharpRightRoundedIcon from '@mui/icons-material/TurnSharpRightRounded'
import UTurnLeftRoundedIcon from '@mui/icons-material/UTurnLeftRounded'
import RoundaboutRightRoundedIcon from '@mui/icons-material/RoundaboutRightRounded'
import MergeRoundedIcon from '@mui/icons-material/MergeRounded'
import FlagRoundedIcon from '@mui/icons-material/FlagRounded'
import NavigationRoundedIcon from '@mui/icons-material/NavigationRounded'
import type { Glyph } from '../lib/directions'

const ICONS: Record<Glyph, typeof StraightRoundedIcon> = {
  depart: NavigationRoundedIcon,
  arrive: FlagRoundedIcon,
  straight: StraightRoundedIcon,
  left: TurnLeftRoundedIcon,
  right: TurnRightRoundedIcon,
  'slight-left': TurnSlightLeftRoundedIcon,
  'slight-right': TurnSlightRightRoundedIcon,
  'sharp-left': TurnSharpLeftRoundedIcon,
  'sharp-right': TurnSharpRightRoundedIcon,
  uturn: UTurnLeftRoundedIcon,
  roundabout: RoundaboutRightRoundedIcon,
  merge: MergeRoundedIcon,
}

export default function StepGlyph({ glyph, size = 24 }: { glyph: Glyph; size?: number }) {
  const Icon = ICONS[glyph]
  return <Icon sx={{ fontSize: size }} />
}
