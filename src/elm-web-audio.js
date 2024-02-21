// The implementation provided below is *serviceable*. It's capable of diffing
// virtual audio graphs created with the constructors provided here, and handling
// the patching of the underlying AudioNodes. However, it's not particularly
// efficient.
//
// If anyone is interested in making this better in the future, here are some of
// my thoughts:
//
// - We make pretty heavy use of array methods like reduce, map, filter, etc.
//   These are objectively slower than traditional iteration using `for` loops
//   so we can probably see some immediate performance gains by switching to
//   this.
//
// - We also end up repeating quite a lot of this iteration instead of saving
//   the results and reusing them. This happens all over the place in the diffing
//   algorithm; we'll filter the list of previous keys for ones not present in
//   the current graph, then we'll filter the current keys for ones not present
//   in the previous graph even though we can already work that out from what
//   we already know.
//
// - We only support a subset of the Web Audio API. Specifically, we don't support
//   buffer sources so playing audio files is out of the question. That kind of
//   sucks and I expect it will be dealbreaker for those seriously considering
//   adopting this library for their own code.
//
// - We also don't support custom or external audio nodes like those provided
//   by tone.js or tuna. This isn't particularly horrible to implement, fortunately
//   they will all abide by the same basic AudioNode api, so allowing developers
//   to extend the VirtualAudioContext with knowledge of these nodes would be
//   really nice.
//
// - How to handle things like visualsation is a bit of a mystery to me.
//
// - Similarly, handling of scheduled param updates is a bit naff. It's just about
//   servicable but the api provided by Web Audio is also a bit naff so maybe
//   we just have to live with that.
//

// NODES -----------------------------------------------------------------------

export function node(type, properties = [], connections = []) {
    return { type, properties, connections }
}

export function keyed(key, node) {
    return key ? { key, ...node } : node
}

export function ref(key) {
    return { key, type: 'RefNode' }
}

// PROPERTIES ------------------------------------------------------------------

export function property(label, value) {
    return { type: 'NodeProperty', label, value }
}

export function param(label, value) {
    return { type: 'AudioParam', label, value }
}

export function scheduledUpdate(label, method, target, time) {
    return { type: 'ScheduledUpdate', label, value: { method, target, time } }
}

export function setValueAtTime(time, label, value) {
    return scheduledUpdate(label, 'setValueAtTime', value, time)
}

export function linearRampToValueAtTime(time, label, value) {
    return scheduledUpdate(label, 'linearRampToValueAtTime', value, time)
}

export function exponentialRampToValueAtTime(time, label, value) {
    return scheduledUpdate(label, 'exponentialRampToValueAtTime', value, time)
}

// AUDIO CONTEXT ---------------------------------------------------------------

export class VirtualAudioContext extends AudioContext {
    constructor() {
        super()

        // Keep a history of the previous virtual audio graph so we can diff it
        // against an incoming one.
        this.prev = {}

        // This stores the actual real audio nodes.
        this.nodes = {}
    }

    update(graph = []) {
        const nodes = graph.reduce(flatten(), {})
        const patch = diff(this.prev, nodes)
        this.applyPatch(patch)
        this.prev = nodes
        return this.nodes
    }

    applyPatch(patch) {
        patch.deleted.forEach(deleted => {
            switch (deleted.type) {
                case 'Connection':
                    return this.disconnect(deleted.from, deleted.to)

                case 'NodeProperty': {
                    delete this.nodes[deleted.key][deleted.label]
                    return
                }

                case 'AudioParam': {
                    // An AudioParam will only be in a deleted patch if both the
                    // param and all of it's scheduled updates have been removed.
                    // In that case we'll want to cancel any updates that might've
                    // been scheduled up until now.
                    this.nodes[deleted.key][deleted.label].cancelScheduledValues(this.currentTime)
                    // AudioParams have an associated `defaultValue` property
                    // that we can revert to – we don't want to *actually* delete
                    // the param.
                    this.nodes[deleted.key][deleted.label].value = this.nodes[deleted.key][deleted.label].defaultValue
                    return
                }

                default:
                    return this.deleteNode(deleted.key)
            }
        })

        patch.created.forEach(created => {
            switch (created.type) {
                case 'Connection':
                    return this.connect(created.from, created.to)

                // NodeProperties are just regular object properties, so we can
                // just assign them on the node whether they currently exist
                // or not.
                case 'NodeProperty': {
                    this.nodes[created.key][created.label] = created.value
                    return
                }

                // AudioParams are a bit special. Each audio node has a specific
                // set of AudioParams associated with it (e.g. GainNode has gain,
                // but not frequency) so we need to check if the label exists on
                // the node before we start fiddling with it.
                case 'AudioParam': {
                    const { key, label, value } = created
                    const param = this.nodes[key][label]
                    if (param instanceof AudioParam) {
                        param.value = value
                    }
                    return
                }

                case 'ScheduledUpdate': {
                    const { key, label, value } = created
                    const { method, target, time } = value
                    const param = this.nodes[key][label]
                    if (param instanceof AudioParam) {
                        param[method](target, time)
                    }
                    return
                }

                // If it isn't anything else, it must be a new node
                default: {
                    const newNode = this.createNode(created)

                    // Save our new actual real audio node.
                    this.nodes[created.key] = newNode

                    // Create a dummy "previous" node and diff so that we can
                    // get a patch for the new one
                    const nodePatch = diffNode(node(created.type, [], []), created)
                    nodePatch.created.forEach(c => c.key = created.key)
                    this.applyPatch(nodePatch)
                    return
                }
            }
        })
    }

    createNode({ type, properties }) {
        const node = (() => {
            switch (type) {
                case 'AudioDestinationNode':
                    return this.destination

                case 'BiquadFilterNode':
                    return this.createBiquadFilter()

                case 'ConstantSourceNode':
                    return this.createConstantSource()

                case 'ConvolverNode':
                    return this.createConvolver()

                case 'DelayNode': {
                    const maxDelayTime = properties.find(p => p.label === 'maxDelayTime')?.value ?? 1

                    return this.createDelay(maxDelayTime)
                }

                case 'DynamicsCompressorNode':
                    return this.createDynamicsCompressor()

                case 'GainNode':
                    return this.createGain()

                case 'OscillatorNode':
                    return this.createOscillator()

                case 'StereoPannerNode':
                    return this.createStereoPanner()

                case 'WaveShaperNode':
                    return this.createWaveShaper()

                default: {
                    // This is a known AudioNode that we currently do not support.
                    if (type in window && window[type].prototype instanceof window.AudioNode) {
                        console.warn(
                            `AudioNodes of type ${type} are not currently supported.`,
                            `Please consider opening a PR if you're interested in adding support for this node.`,
                            `Creating a dummy gain node instead.`
                        )
                    }
                    // This must be some sort of custom node - or maybe just
                    // straight up invalid - so we'll just print a generic warning.
                    else {
                        console.warn(
                            `${type} is not a recognised AudioNode.`,
                            `Currently custom nodes (eg from tone.js) are not supported.`,
                            `Please consider opening a PR if you're interested in adding support for custom nodes.`,
                            `Creating a dummy gain node instead.`
                        )
                    }

                    return this.createGain()
                }
            }
        })()

        // Certain nodes, like oscillators, must be explicitly started at a given
        // time before they'll start processing samples. Because our graph is
        // a declarative representation of audio state, if we're trying to create
        // one of these nodes now it's because we want it to start making sound
        // now, so let's start it!
        if ('start' in node) {
            node.start(this.currentTime)
        }

        return node;
    }

    connect(from = '', to = '') {
        const [toNode, toParam] = to.split('.')

        window.setTimeout(() => {
            if (from in this.nodes && toNode in this.nodes) {
                if (toParam && toParam in this.nodes) {
                    this.nodes[from].connect(this.nodes[toNode][toParam])
                } else {
                    this.nodes[from].connect(this.nodes[toNode], 0, 0)
                }
            }
        }, 0)
    }

    deleteNode(key = '') {
        if (key in this.nodes) {
            this.nodes[key].disconnect()
            delete this.nodes[key]
        }
    }

    disconnect(from = '', to = null) {
        // Guard to make sure we don't try to disconnect a node that doesn't
        // even exist.
        if (from in this.nodes) {
            // `to` is optional, if it isn't provided we'll disconnect the node
            // from all of its connections instead of a single specific one.
            if (to) {
                const [toNode, toParam] = to.split('.')

                // Guard to make sure we don't try to disconnect from a node that
                // doesn't even exist.
                if (toNode in this.nodes) {
                    // Connections can look like `foo.frequency` or just `foo`.
                    // The former is a notation that allows us to connect to
                    // specific audio params, so we need to check if a) we have
                    // a param connection, and b) that param actually exists on
                    // the target node.
                    if (toParam && toParam in this.nodes[toNode]) {
                        this.nodes[from].disconnect(this.nodes[toNode][toParam])
                    } else {
                        this.nodes[from].disconnect(this.nodes[toNode])
                    }
                }
            } else {
                this.nodes[from].disconnect()
            }
        }
    }
}

// Making the default export the class is handy, it means people can do a nice
// import like
//
//     import VirtualAudioContext, * as Audio from 'virtual-audio-context'
//
export default VirtualAudioContext

// UTILS -----------------------------------------------------------------------

function flatten(base = '') {
    return (nodes, node, idx) => {
        if (node.type === 'RefNode') {
            return nodes
        }

        const key = node.key || (base + idx)
        const connections = node.connections.map((connection, i) => connection.key || (key + i))

        return node.connections.reduce(flatten(key), { ...nodes, [key]: { ...node, key, connections } })
    }
}

function diff(prev = {}, curr = {}) {
    const patch = {
        created: [],
        deleted: []
    }

    Object.keys(curr).forEach(key => {
        // The key is also in the previous graph, so we're updating an existing
        // node.
        if (key in prev) {
            const prevNode = prev[key]
            const currNode = curr[key]

            // The node type has changed, so we need to delete the old node and
            // create a new one.
            if (prevNode.type !== currNode.type) {
                patch.deleted.push(key)
                patch.created.push(currNode)
            }

            // The node type hasn't changed, so we can just update the existing
            // node.
            else {
                const nodePatch = diffNode(prevNode, currNode)

                nodePatch.created.forEach(created => patch.created.push({ key, ...created }))
                nodePatch.deleted.forEach(deleted => patch.deleted.push({ key, ...deleted }))
            }
        }
        // The key is not in the previous graph, so this must be constructing a
        // new node.
        else {
            patch.created.push(curr[key])
        }
    })

    Object.keys(prev).forEach(key => {
        // The key is not in the current graph, so this node must be removed.
        if (!(key in curr)) {
            patch.deleted.push(({ type: 'AudioNode', key }))
        }
    })

    return patch
}

// This helper functions assumes the `type` of both nodes *is the same*. Bad
// things will happen if you try and diff a `gain` node with an `oscillator`
// and expect the patch to make sense.
function diffNode(prev, curr) {
    const patch = {
        created: [],
        deleted: []
    }

    const prevNodeProperties = prev.properties
        .filter(({ type }) => type === 'NodeProperty' || type === 'AudioParam')
        .reduce((props, prop) => ({ ...props, [prop.label]: prop }), {})

    const currNodeProperties = curr.properties
        .filter(({ type }) => type === 'NodeProperty' || type === 'AudioParam')
        .reduce((props, prop) => ({ ...props, [prop.label]: prop }), {})

    Object.keys(prevNodeProperties).forEach(label => {
        // The property exists on both nodes, and the value has changed. That's
        // an update!
        if (label in currNodeProperties) {
            if (prevNodeProperties[label].value !== currNodeProperties[label].value) {
                // We don't actually need to keep track of an `updated` property
                // on the patch. We can just use `created` and `deleted`.
                patch.created.push(currNodeProperties[label])
            }
        }

        // The property exists on the previous node, but not the current one.
        // That's a delete!
        // For AudioParams, we also make sure that there are no scheduled updates
        // that affect this param before we delete it.
        else if (prevNodeProperties[label].type !== 'AudioParam'
            || !curr.properties.some(prop => prop.type === 'ScheduledUpdate' && prop.label))
        {
            patch.deleted.push(prevNodeProperties[label])
        }
    })

    Object.keys(currNodeProperties).forEach(label => {
        // The property exists on the current node, but not the previous one.
        // That's a create!
        if (!(label in prevNodeProperties)) {
            patch.created.push(currNodeProperties[label])
        }
    })

    // I can't really think of a good way to deal with scheduled updates right
    // now. Particularly in how to cancel existing updates or how to diff them
    // in general.
    //
    // For now we'll just keep on scheduling new updates and ignore ones that
    // were previously scheduled.
    curr.properties.filter(({ type }) => type === 'ScheduledUpdate').forEach(update => {
        const existsOnPrev = prev.properties.some(({ type, label, value }) =>
            // JavaScript doesn't have structural equality, so there's not
            // really a concise way to check if this update already exists on
            // the previous graph.
            type === update.type
            && label === update.label
            && value.method == update.value.method
            && value.time === update.value.time
            && value.target === update.value.target
        )

        if (!existsOnPrev) {
            patch.created.push(update)
        }
    })

    curr.connections.forEach(key => {
        if (!prev.connections.includes(key)) {
            patch.created.push(({ type: 'Connection', from: curr.key, to: key }))
        }
    })

    prev.connections.forEach(key => {
        if (!curr.connections.includes(key)) {
            patch.deleted.push(({ type: 'Connection', from: curr.key, to: key }))
        }
    })

    return patch
}
