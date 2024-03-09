module WebAudio.Internal exposing ( Node, node, param, keyed, ref, encode )

import WebAudio.Property exposing ( Property )
import Json.Encode


type Node
    = Node InternalNode


type InternalNode
    = AudioNode (Maybe String) String (List Property) (List Node)
    | AudioParam String String
    | Ref String


node : String -> List Property -> List Node -> Node
node name props connexions =
    Node <| AudioNode Nothing name props connexions


param : String -> String -> Node
param name key =
    Node <| AudioParam name key


keyed : String -> Node -> Node
keyed key ( Node internal ) =
    case internal of
        AudioNode _ n ps cs -> Node <| AudioNode (Just key) n ps cs
        AudioParam name _ -> Node <| AudioParam name key
        Ref _ -> Node <| Ref key


ref : String -> Node
ref =
    Node << Ref


encode : Node -> Json.Encode.Value
encode ( Node n ) =
    Json.Encode.object <|
        case n of
            AudioNode mk t ps cs ->
                [ ( "type", Json.Encode.string t )
                , ( "properties", Json.Encode.list WebAudio.Property.encode ps )
                , ( "connections", Json.Encode.list encode cs )
                ]
                ++  case mk of
                    Nothing -> []
                    Just k -> [ ( "key", Json.Encode.string k ) ]
            Ref k ->
                [ ( "type", Json.Encode.string "RefNode" )
                , ( "key", Json.Encode.string k )
                ]
            AudioParam p k ->
                [ ( "type", Json.Encode.string "AudioParam" )
                , ( "label", Json.Encode.string p )
                , ( "key", Json.Encode.string k )
                ]
