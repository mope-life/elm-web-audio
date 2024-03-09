module WebAudio.Param exposing
    ( amp, attack, delayTime, detune, frequency, freq, gain, knee, offset
    , orientationX, orientationY, orientationZ, pan, playbackRate, positionX
    , positionY, positionZ, q, ratio, reduction, release, threshold
    )


import WebAudio.Internal exposing (Node, param)

{-| -}
amp : String -> Node
amp = gain


{-| -}
attack : String -> Node
attack =
    param "attack"


{-| -}
delayTime : String -> Node
delayTime =
    param "delayTime"


{-| -}
detune : String -> Node
detune =
    param "detune"


{-| -}
frequency : String -> Node
frequency =
    param "frequency"


{-| -}
freq : String -> Node
freq =
    param "frequency"


{-| -}
gain : String -> Node
gain =
    param "gain"


{-| -}
knee : String -> Node
knee =
    param "knee"


{-| -}
offset : String -> Node
offset =
    param "offset"


{-| -}
orientationX : String -> Node
orientationX =
    param "orientationX"


{-| -}
orientationY : String -> Node
orientationY =
    param "orientationY"


{-| -}
orientationZ : String -> Node
orientationZ =
    param "orientationZ"


{-| -}
pan : String -> Node
pan =
    param "pan"


{-| -}
playbackRate : String -> Node
playbackRate =
    param "playbackRate"


{-| -}
positionX : String -> Node
positionX =
    param "positionX"


{-| -}
positionY : String -> Node
positionY =
    param "positionY"


{-| -}
positionZ : String -> Node
positionZ =
    param "positionZ"


{-| -}
q : String -> Node
q =
    param "q"


{-| -}
ratio : String -> Node
ratio =
    param "ratio"


{-| -}
reduction : String -> Node
reduction =
    param "reduction"


{-| -}
release : String -> Node
release =
    param "release"


{-| -}
threshold : String -> Node
threshold =
    param "threshold"
