// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract OpenMintNFT is ERC721URIStorage {

    uint256 private _nextTokenId;
    uint256 public maxSupply;

    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);

    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply
    ) ERC721(name, symbol) {
        maxSupply = _maxSupply; // pass 0 for unlimited
    }

    /**
     * @notice Anyone can mint an NFT to any address.
     * @param to   Recipient wallet address
     * @param uri  Metadata URI (e.g. ipfs://...)
     */
    function mint(address to, string memory uri) public returns (uint256) {
    if (maxSupply > 0) {
        require(_nextTokenId < maxSupply, "Max supply reached");
    }

    uint256 tokenId = _nextTokenId;
    _nextTokenId++;

    _mint(to, tokenId);          // ← _mint instead of _safeMint
    _setTokenURI(tokenId, uri);

    emit Minted(to, tokenId, uri);
    return tokenId;
}

    /**
     * @notice Total number of tokens minted so far.
     */
    function totalMinted() public view returns (uint256) {
        return _nextTokenId;
    }
}